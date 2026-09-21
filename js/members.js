// ==========================================
// DERASAR BOLI - Members
// ==========================================

async function renderMembers() {
  const content = document.getElementById('page-content');
  content.innerHTML = `
    <div class="card">
      <div class="section-header">
        <h3>Members List</h3>
        <div style="display:flex;gap:8px;">
          <button class="btn-secondary btn-sm" onclick="downloadMembersExcel()">⬇️ Excel</button>
          <button class="btn-accent btn-sm" onclick="showAddMemberModal()">+ Add Member</button>
        </div>
      </div>
      <div id="members-stats" style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:12px;">
        <div style="color:var(--text-muted);font-size:13px;">Loading stats...</div>
      </div>
      <div class="search-box" style="margin-bottom:14px;">
        <input type="text" id="member-search" placeholder="Search by name, family no, old no or phone..." oninput="searchMembers()" />
      </div>
      <div id="members-list">Loading...</div>
    </div>
  `;
  await Promise.all([loadMembersStats(), loadMembersList()]);
}

async function loadMembersStats() {
  const [{ data }, { data: individuals }] = await Promise.all([
    db.from('dr_members').select('family_no, phone_no, family_member_count').eq('org_id', currentOrgId),
    db.from('dr_family_individuals').select('family_no').eq('org_id', currentOrgId)
  ]);
  const el = document.getElementById('members-stats');
  if (!el || !data) return;
  const individualCounts = {};
  (individuals || []).forEach(p => { individualCounts[p.family_no] = (individualCounts[p.family_no] || 0) + 1; });
  const uniqueFamilies = new Set(data.map(m => m.family_no).filter(Boolean)).size;
  // Prefer the live Family Members count over the one-off typed-in number
  // (see loadMembersList for why — same staleness bug, same fix).
  const totalPersons   = data.reduce((s, m) => s + (individualCounts[m.family_no] ?? m.family_member_count ?? 0), 0);
  const missingPhone   = data.filter(m => !m.phone_no).length;
  const chip = (icon, val, label, warn) =>
    `<div style="display:flex;align-items:center;gap:6px;padding:8px 14px;border-radius:20px;font-size:13px;font-weight:600;
      background:${warn && val > 0 ? '#fff0f0' : '#FFF8F0'};border:1.5px solid ${warn && val > 0 ? '#f44336' : 'var(--accent)'};
      color:${warn && val > 0 ? '#c62828' : 'var(--primary)'};">
      ${icon} <span>${val}</span> <span style="font-weight:400;">${label}</span>
    </div>`;
  el.innerHTML =
    chip('👨‍👩‍👧', uniqueFamilies, 'Families') +
    chip('👤', totalPersons, 'Members') +
    chip(missingPhone > 0 ? '⚠️' : '✅', missingPhone, 'Missing Phone', true);
}

function sortFamilyNo(data) {
  const parse = s => {
    const m = (s || '').match(/^([A-Za-z]+)-?(\d+)$/);
    return m ? [m[1].toUpperCase(), parseInt(m[2])] : [s || '', 0];
  };
  return data.slice().sort((a, b) => {
    const [aL, aN] = parse(a.family_no);
    const [bL, bN] = parse(b.family_no);
    return aL < bL ? -1 : aL > bL ? 1 : aN - bN;
  });
}

async function loadMembersList(query = '') {
  let req = db.from('dr_members').select('*').eq('org_id', currentOrgId);
  if (query) req = req.or(`person_name.ilike.%${query}%,family_no.ilike.%${query}%,old_member_no.ilike.%${query}%,phone_no.ilike.%${query}%`);
  const { data: raw, error } = await req;
  const data = raw ? sortFamilyNo(raw) : raw;

  const el = document.getElementById('members-list');
  if (error || !data || data.length === 0) {
    el.innerHTML = `<div class="empty-state"><div class="empty-icon">👥</div><p>No members found.</p></div>`;
    return;
  }

  // family_member_count is a number typed in once at Add Member time and
  // never updated after — adding more names via the Family Members batch
  // list (or the 👪 flow before it was folded into Edit) left this column
  // stuck at whatever was typed initially, so it kept showing "1" for a
  // family that had genuinely grown to 4 individuals (real report
  // 2026-09-18, family V14: 3 names added today, list still said 1).
  // dr_family_individuals is the live source of truth for who's actually
  // in the family, so prefer its count wherever it has any rows at all.
  const { data: allIndividuals } = await db.from('dr_family_individuals')
    .select('family_no').eq('org_id', currentOrgId);
  const individualCounts = {};
  (allIndividuals || []).forEach(p => {
    individualCounts[p.family_no] = (individualCounts[p.family_no] || 0) + 1;
  });

  // Latest membership fee year per family - one query for the whole org,
  // reduced client-side to the max year per family_no (PostgREST has no
  // easy DISTINCT ON), same shape as individualCounts above.
  const { data: allFees } = await db.from('dr_membership_fees')
    .select('family_no, year, amount, receipt_no').eq('org_id', currentOrgId);
  const latestFee = {};
  (allFees || []).forEach(f => {
    if (!latestFee[f.family_no] || f.year > latestFee[f.family_no].year) latestFee[f.family_no] = f;
  });

  el.innerHTML = `
    <div style="overflow-x:auto;">
    <table class="data-table">
      <thead>
        <tr><th>Family No.</th><th>Old No.</th><th>Name</th><th>Phone</th><th>Members</th><th>Last Fee Paid</th><th>Actions</th></tr>
      </thead>
      <tbody>
        ${data.map(m => {
          const fee = m.family_no ? latestFee[m.family_no] : null;
          return `
          <tr>
            <td><strong>${m.family_no}</strong></td>
            <td><input type="text" value="${(m.old_member_no || '').replace(/"/g, '&quot;')}" placeholder="—"
              style="width:70px;padding:4px 6px;font-size:12px;border:1.5px solid var(--border);border-radius:5px;"
              onchange="updateOldMemberNo('${m.id}', this.value)" onclick="event.stopPropagation()" /></td>
            <td>${m.person_name}${m.address ? `<div style="font-size:11px;color:var(--text-muted);">${m.address}</div>` : ''}</td>
            <td>${m.phone_no
              ? `<a href="tel:${m.phone_no}" style="color:var(--primary);text-decoration:none;">${m.phone_no}</a>`
              : '<span style="color:#f44;font-size:11px;">⚠ Missing</span>'}</td>
            <td style="text-align:center;">${individualCounts[m.family_no] ?? m.family_member_count ?? '—'}</td>
            <td style="font-size:12px;">${fee
              ? `${fee.year} · ₹${parseFloat(fee.amount).toLocaleString('en-IN')}${fee.receipt_no ? ` <span style="color:var(--text-muted);">#${fee.receipt_no}</span>` : ''}`
              : '<span style="color:#f44;">Not paid</span>'}</td>
            <td>
              <div style="display:flex;gap:5px;flex-wrap:wrap;">
                <button class="btn-sm btn-secondary" title="Donation History" onclick="showDonorHistory('${m.id}','${m.person_name.replace(/'/g,"\\'")}','${(m.family_no||'').replace(/'/g,"\\'")}')">📜</button>
                ${m.family_no ? `<button class="btn-sm" style="background:#7B3F00;color:white;" title="Membership Card" onclick="showMembershipCard('${m.family_no.replace(/'/g,"\\'")}')">🪪</button>` : ''}
                ${m.family_no ? `<button class="btn-sm" style="background:#1450c9;color:white;" title="Event Pass" onclick="showFamilyPassModal('${m.family_no.replace(/'/g,"\\'")}','${m.person_name.replace(/'/g,"\\'")}')">🎟</button>` : ''}
                ${m.family_no ? `<button class="btn-sm" style="background:#8B5A00;color:white;" title="Membership Fee" onclick="showMembershipFeeModal('${m.family_no.replace(/'/g,"\\'")}','${m.person_name.replace(/'/g,"\\'")}')">💳</button>` : ''}
                <button class="btn-sm" style="background:#4CAF50;color:white;" title="Edit Member" onclick="showEditMemberModal('${m.id}')">Edit</button>
                <button class="btn-sm btn-danger" title="Delete Member" onclick="deleteMember('${m.id}')">Del</button>
              </div>
            </td>
          </tr>
        `; }).join('')}
      </tbody>
    </table>
    </div>
    <p style="font-size:12px;color:var(--text-muted);margin-top:10px;">${data.length} families
      &nbsp;·&nbsp; ${data.reduce((s,m)=>s+(individualCounts[m.family_no] ?? m.family_member_count ?? 0),0)} persons
      &nbsp;·&nbsp; Missing phone: ${data.filter(m => !m.phone_no).length}
    </p>
  `;
}

// Saves straight from the list table, no Edit modal needed — old numbers
// come from the temple's pre-app Excel register and need to be entered in
// bulk against members already migrated into the app, so editing one at a
// time via a modal per row would be far too slow (user request 2026-09-15).
async function updateOldMemberNo(id, value) {
  const old_member_no = value.trim() || null;
  const { error } = await db.from('dr_members').update({ old_member_no }).eq('id', id);
  if (error) { showToast('Error: ' + error.message, 'error'); return; }
  showToast('✅ Saved', 'success');
}

// ========== EXCEL EXPORT ==========
async function downloadMembersExcel() {
  if (typeof XLSX === 'undefined') {
    showToast('Excel library not loaded. Check internet connection.', 'error');
    return;
  }

  const { data: raw, error } = await db.from('dr_members').select('*').eq('org_id', currentOrgId);
  if (error || !raw) { showToast('Could not load members', 'error'); return; }
  const data = sortFamilyNo(raw);

  const rows = [
    ['Family No.', 'Old No.', 'Name', 'Phone', 'Address', 'Family Member Count']
  ];
  data.forEach(m => {
    rows.push([m.family_no || '', m.old_member_no || '', m.person_name || '', m.phone_no || '', m.address || '', m.family_member_count || '']);
  });

  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!cols'] = [{wch:10},{wch:10},{wch:32},{wch:14},{wch:32},{wch:12}];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Members');

  const fileName = `DerasarBoli_Members_${new Date().toISOString().slice(0,10)}.xlsx`;
  XLSX.writeFile(wb, fileName);
  showToast('✅ Excel downloaded!', 'success');
}

let memberSearchTimer = null;
function searchMembers() {
  clearTimeout(memberSearchTimer);
  memberSearchTimer = setTimeout(() => {
    const q = document.getElementById('member-search').value.trim();
    loadMembersList(q);
  }, 300);
}

function showAddMemberModal() {
  showModal(`
    <div class="modal-title">Add Member</div>
    <div style="display:flex;gap:8px;">
      <div class="form-group" style="flex:1;">
        <label>Family No. <span style="color:#c00;">*</span></label>
        <input type="text" id="mem-family" placeholder="Auto-suggested, e.g. A11" />
        <div style="font-size:11px;color:var(--text-muted);margin-top:2px;">Auto-filled for a new family based on the name below. To add this person to an existing family instead, type that family's number here first.</div>
      </div>
      <div class="form-group" style="flex:1;">
        <label>No. of Family Members</label>
        <input type="number" id="mem-count" placeholder="e.g. 4" min="1" />
      </div>
    </div>
    <div class="form-group">
      <label>Person Name (Head) <span style="color:#c00;">*</span></label>
      <input type="text" id="mem-name" placeholder="Full name" onblur="suggestFamilyNo()" />
    </div>
    <div style="display:flex;gap:8px;">
      <div class="form-group" style="flex:1;">
        <label>DOB (Head)</label>
        <input type="date" id="mem-dob" onchange="showComputedAge('mem-dob','mem-age')" />
      </div>
      <div class="form-group" style="flex:1;">
        <label>Age <span style="font-weight:400;color:var(--text-muted);">(if DOB unknown)</span></label>
        <input type="number" id="mem-age" min="0" max="130" placeholder="e.g. 62" />
      </div>
      <div class="form-group" style="flex:1;">
        <label>Gender (Head)</label>
        <select id="mem-gender">
          <option value="">—</option>
          <option value="M">Male</option>
          <option value="F">Female</option>
          <option value="O">Other</option>
        </select>
      </div>
    </div>
    <div class="form-group">
      <label>Old Member No. <span style="font-weight:400;color:var(--text-muted);">(from previous register)</span></label>
      <input type="text" id="mem-old-no" placeholder="e.g. 245" />
    </div>
    <div class="form-group">
      <label>Phone No.</label>
      <input type="tel" id="mem-phone" placeholder="e.g. 9876543210" />
    </div>
    <div class="form-group">
      <label>Address</label>
      <input type="text" id="mem-address" placeholder="e.g. 12, Harinagar Society" />
    </div>
    <div class="modal-actions">
      <button class="btn-primary" onclick="addMember(null, null, this)">Save</button>
      <button class="btn-secondary" onclick="closeModal()">Cancel</button>
    </div>
  `);
}

// Age has its own field (many members, especially older ones, don't know
// their exact DOB but do know their approximate age) — when DOB IS known,
// this auto-fills Age from it as a convenience, but Age stays independently
// editable/overridable and is what actually gets saved. Like the source
// Google Form, a typed age is a snapshot as of entry time, not recomputed
// later — accepted since that's already how the form itself behaves.
function calcAge(dobStr) {
  if (!dobStr) return null;
  const dob = new Date(dobStr);
  if (isNaN(dob)) return null;
  const today = new Date();
  let age = today.getFullYear() - dob.getFullYear();
  const m = today.getMonth() - dob.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < dob.getDate())) age--;
  return age >= 0 ? age : null;
}

function showComputedAge(dobFieldId, ageFieldId) {
  const el = document.getElementById(ageFieldId);
  if (!el) return;
  const age = calcAge(document.getElementById(dobFieldId)?.value);
  if (age != null) el.value = age;
}

// Next family_no in the A1/A2.../B1... scheme: first letter of the head's
// name + one past the highest existing number already used for that letter.
async function computeNextFamilyNo(headName) {
  const match = (headName || '').match(/[A-Za-z]/);
  const letter = match ? match[0].toUpperCase() : 'Z';

  const { data } = await db.from('dr_members')
    .select('family_no')
    .eq('org_id', currentOrgId)
    .ilike('family_no', letter + '%');

  let maxNum = 0;
  const re = new RegExp('^' + letter + '(\\d+)$', 'i');
  (data || []).forEach(r => {
    const m = re.exec(r.family_no || '');
    if (m) maxNum = Math.max(maxNum, parseInt(m[1], 10));
  });

  return letter + (maxNum + 1);
}

async function suggestFamilyNo() {
  const famEl = document.getElementById('mem-family');
  const nameEl = document.getElementById('mem-name');
  if (!famEl || !nameEl) return;
  if (famEl.value.trim()) return; // don't override a family no. already typed (adding to an existing family)
  const name = nameEl.value.trim();
  if (!name) return;
  famEl.value = await computeNextFamilyNo(name);
}

async function addMember(familyNo = null, personName = null, btn = null) {
  const family_no           = familyNo   || document.getElementById('mem-family')?.value.trim();
  const person_name         = personName || document.getElementById('mem-name')?.value.trim();
  const phone_no            = document.getElementById('mem-phone')?.value.trim()   || null;
  const address             = document.getElementById('mem-address')?.value.trim() || null;
  const family_member_count = parseInt(document.getElementById('mem-count')?.value) || null;
  const old_member_no       = document.getElementById('mem-old-no')?.value.trim() || null;
  const dob                 = document.getElementById('mem-dob')?.value || null;
  const age                 = parseInt(document.getElementById('mem-age')?.value) || null;
  const gender              = document.getElementById('mem-gender')?.value || null;

  if (!family_no || !person_name) { showToast('Family No. and Name are required', 'error'); return null; }

  // Guard against a double-click/double-tap creating two identical family
  // rows before the first insert finishes — no unique constraint on
  // family_no catches this at the DB level, so it silently created twin
  // "A19"/"J19"/"L2" rows in real data (2026-09-15), which also broke the
  // Membership Card (its lookup expects exactly one row per family_no).
  if (btn) { if (btn.disabled) return null; btn.disabled = true; btn.textContent = 'Saving…'; }

  const { data, error } = await db.from('dr_members')
    .insert({ family_no, person_name, phone_no, address, family_member_count, old_member_no, org_id: currentOrgId, is_head: true })
    .select().single();
  if (error) {
    showToast('Error: ' + error.message, 'error');
    if (btn) { btn.disabled = false; btn.textContent = 'Save'; }
    return null;
  }

  if (!familyNo) {
    // Also seed dr_family_individuals with the head — that table is the
    // one the "Receipt In Name Of" dropdown actually reads from (separate
    // from dr_members, which is just the head-only roster), and without
    // this row the head themselves would never appear as a pickable name
    // there, only "Same as Donor". Only for a genuinely NEW family (this
    // branch) — adding a person to an existing family shouldn't re-seed it.
    const { error: individualError } = await db.from('dr_family_individuals')
      .insert({ org_id: currentOrgId, family_no, person_name, is_head: true, dob, age, gender, phone_no });

    closeModal();
    showToast('Member added!', 'success');
    if (individualError) {
      // dr_members insert above already succeeded — the member exists — but
      // the head won't show up in the "Receipt In Name Of" dropdown until
      // this is retried, so surface it rather than silently dropping it.
      showToast('Note: could not add "' + person_name + '" to Receipt In Name Of list — ' + individualError.message, 'error');
    }
    await Promise.all([loadMembersStats(), loadMembersList()]);
    showFamilyIndividualsModal(family_no, person_name);
  }
  return data;
}

// ========== FAMILY INDIVIDUALS (names for the "Receipt In Name Of" dropdown) ==========
// dr_family_individuals is deliberately separate from dr_members — the
// Members list stays one row per family (head only), while this holds
// every individual name a receipt might need to be printed under. Add
// Member seeds the head automatically; this modal is for the rest of the
// family, added as a batch (paste/type names, one per line) rather than
// one at a time — repeating a full add-member form per person was the
// exact friction that made this feature impractical to use (user
// feedback 2026-09-10).
// Detailed per-member rows (Name/DOB/Gender/Phone) mirroring the Google
// Form's M1-M8 layout, so any Sangh without a Google Form of their own can
// capture the same detail directly here. A dynamic "+ Add Row" list inside
// ONE modal (not one add-member-style form per person) keeps this usable —
// repeating a full form per person was the exact friction that made the
// original name-only version necessary (user feedback 2026-09-10); this
// keeps that single-screen shape while adding the extra fields.
let newIndivRowCount = 0;

function newIndivRowHtml(n) {
  return `
    <div id="new-indiv-row-${n}" style="display:flex;gap:6px;align-items:flex-end;margin-bottom:8px;flex-wrap:wrap;">
      <div class="form-group" style="margin-bottom:0;flex:2;min-width:140px;">
        <label style="font-size:11px;">Name</label>
        <input type="text" id="new-indiv-name-${n}" placeholder="Full name" />
      </div>
      <div class="form-group" style="margin-bottom:0;flex:1;min-width:120px;">
        <label style="font-size:11px;">DOB</label>
        <input type="date" id="new-indiv-dob-${n}" onchange="showComputedAge('new-indiv-dob-${n}','new-indiv-age-${n}')" />
      </div>
      <div class="form-group" style="margin-bottom:0;flex:1;min-width:70px;">
        <label style="font-size:11px;">Age</label>
        <input type="number" id="new-indiv-age-${n}" min="0" max="130" placeholder="If DOB unknown" />
      </div>
      <div class="form-group" style="margin-bottom:0;flex:1;min-width:90px;">
        <label style="font-size:11px;">Gender</label>
        <select id="new-indiv-gender-${n}">
          <option value="">—</option>
          <option value="M">Male</option>
          <option value="F">Female</option>
          <option value="O">Other</option>
        </select>
      </div>
      <div class="form-group" style="margin-bottom:0;flex:1;min-width:110px;">
        <label style="font-size:11px;">Phone</label>
        <input type="tel" id="new-indiv-phone-${n}" placeholder="Optional" />
      </div>
      <button class="btn-sm btn-danger" onclick="document.getElementById('new-indiv-row-${n}').remove()">✕</button>
    </div>`;
}

function addNewIndivRow() {
  newIndivRowCount++;
  document.getElementById('new-indiv-rows').insertAdjacentHTML('beforeend', newIndivRowHtml(newIndivRowCount));
}

async function showFamilyIndividualsModal(familyNo, headName) {
  const { data: existing } = await db.from('dr_family_individuals')
    .select('id, person_name, is_head, dob, age, gender, phone_no').eq('org_id', currentOrgId).eq('family_no', familyNo)
    .order('is_head', { ascending: false });

  const listHtml = (existing && existing.length)
    ? existing.map(p => `
        <div style="display:flex;justify-content:space-between;align-items:center;padding:6px 0;border-bottom:1px solid var(--border);font-size:13px;">
          <span>${p.person_name}${p.is_head ? ' <span style="font-size:11px;color:var(--text-muted);">(Head)</span>' : ''}
            <span style="font-size:11px;color:var(--text-muted);">${[p.gender, (p.age ?? (p.dob ? calcAge(p.dob) : null)) != null ? (p.age ?? calcAge(p.dob)) + ' yrs' : '', p.phone_no].filter(Boolean).join(' · ')}</span>
          </span>
          <button class="btn-sm btn-danger" onclick="deleteFamilyIndividual('${p.id}','${familyNo.replace(/'/g, "\\'")}','${(headName || '').replace(/'/g, "\\'")}')">✕</button>
        </div>`).join('')
    : `<p style="font-size:12px;color:var(--text-muted);">No individual names yet — donation receipts for this family will only offer "Same as Donor".</p>`;

  newIndivRowCount = 0;
  showModal(`
    <div class="modal-title">Family Members — ${familyNo}</div>
    <div style="font-size:12px;color:var(--text-muted);margin-bottom:10px;">These appear in the "Receipt In Name Of" dropdown when recording a donation for this family.</div>
    <div style="max-height:180px;overflow-y:auto;margin-bottom:12px;">${listHtml}</div>
    <label style="font-size:13px;font-weight:600;">Add Members</label>
    <div id="new-indiv-rows" style="margin-top:6px;">${newIndivRowHtml(++newIndivRowCount)}</div>
    <button class="btn-sm btn-secondary" onclick="addNewIndivRow()">+ Add Another Row</button>
    <div class="modal-actions">
      <button class="btn-primary" onclick="saveFamilyIndividuals('${familyNo.replace(/'/g, "\\'")}')">💾 Save</button>
      <button class="btn-secondary" onclick="closeModal()">Close</button>
    </div>
  `);
}

function collectNewIndivRows(familyNo) {
  const records = [];
  for (let n = 1; n <= newIndivRowCount; n++) {
    const nameEl = document.getElementById('new-indiv-name-' + n);
    if (!nameEl) continue; // row was removed via ✕
    const person_name = nameEl.value.trim();
    if (!person_name) continue;
    records.push({
      org_id: currentOrgId, family_no: familyNo, person_name, is_head: false,
      dob: document.getElementById('new-indiv-dob-' + n)?.value || null,
      age: parseInt(document.getElementById('new-indiv-age-' + n)?.value) || null,
      gender: document.getElementById('new-indiv-gender-' + n)?.value || null,
      phone_no: document.getElementById('new-indiv-phone-' + n)?.value.trim() || null
    });
  }
  return records;
}

async function saveFamilyIndividuals(familyNo) {
  const records = collectNewIndivRows(familyNo);
  if (records.length === 0) { showToast('Enter at least one name', 'error'); return; }

  const { error } = await db.from('dr_family_individuals').insert(records);
  if (error) { showToast('Error: ' + error.message, 'error'); return; }

  showToast(`✅ Added ${records.length} member${records.length > 1 ? 's' : ''}`, 'success');
  showFamilyIndividualsModal(familyNo);
}

async function deleteFamilyIndividual(id, familyNo, headName) {
  if (!confirm('Remove this name from the family list?')) return;
  const { error } = await db.from('dr_family_individuals').delete().eq('id', id).eq('org_id', currentOrgId);
  if (error) { showToast('Error: ' + error.message, 'error'); return; }
  showToast('Removed');
  showFamilyIndividualsModal(familyNo, headName);
}

async function showEditMemberModal(id) {
  const { data: m, error } = await db.from('dr_members').select('*').eq('id', id).single();
  if (error || !m) { showToast('Could not load member', 'error'); return; }

  // Family Members shown right here (not just via the separate 👪 button)
  // so editing a family doesn't mean hunting for names in two different
  // places — user feedback 2026-09-11: Edit only ever touched the head,
  // the rest of the family was invisible from this screen.
  const { data: individuals } = await db.from('dr_family_individuals')
    .select('id, person_name, is_head, dob, age, gender, phone_no').eq('org_id', currentOrgId).eq('family_no', m.family_no || '')
    .order('is_head', { ascending: false });

  // dr_members has no dob/gender columns of its own for the head — those
  // live only on the head's dr_family_individuals row (is_head=true),
  // seeded when the family was first added.
  const headIndiv = (individuals || []).find(p => p.is_head);

  const individualsHtml = (individuals && individuals.length)
    ? individuals.map(p => `
        <div style="display:flex;gap:6px;align-items:flex-end;margin-bottom:8px;flex-wrap:wrap;">
          <div class="form-group" style="margin-bottom:0;flex:2;min-width:140px;">
            <label style="font-size:11px;">Name ${p.is_head ? '(Head)' : ''}</label>
            <input type="text" id="fam-indiv-name-${p.id}" value="${(p.person_name || '').replace(/"/g, '&quot;')}" />
          </div>
          ${!p.is_head ? `
          <div class="form-group" style="margin-bottom:0;flex:1;min-width:120px;">
            <label style="font-size:11px;">DOB</label>
            <input type="date" id="fam-indiv-dob-${p.id}" value="${p.dob || ''}" onchange="showComputedAge('fam-indiv-dob-${p.id}','fam-indiv-age-${p.id}')" />
          </div>
          <div class="form-group" style="margin-bottom:0;flex:1;min-width:70px;">
            <label style="font-size:11px;">Age</label>
            <input type="number" id="fam-indiv-age-${p.id}" min="0" max="130" value="${p.age ?? ''}" placeholder="If DOB unknown" />
          </div>
          <div class="form-group" style="margin-bottom:0;flex:1;min-width:90px;">
            <label style="font-size:11px;">Gender</label>
            <select id="fam-indiv-gender-${p.id}">
              <option value="" ${!p.gender ? 'selected' : ''}>—</option>
              <option value="M" ${p.gender === 'M' ? 'selected' : ''}>Male</option>
              <option value="F" ${p.gender === 'F' ? 'selected' : ''}>Female</option>
              <option value="O" ${p.gender === 'O' ? 'selected' : ''}>Other</option>
            </select>
          </div>
          <div class="form-group" style="margin-bottom:0;flex:1;min-width:110px;">
            <label style="font-size:11px;">Phone</label>
            <input type="tel" id="fam-indiv-phone-${p.id}" value="${p.phone_no || ''}" />
          </div>
          ` : ''}
          <button class="btn-sm btn-secondary" onclick="updateFamilyIndividual('${p.id}')" title="Save">💾</button>
          ${!p.is_head ? `<button class="btn-sm btn-danger" onclick="deleteFamilyIndividualInline('${p.id}','${id}')">✕</button>` : ''}
        </div>`).join('')
    : `<p style="font-size:12px;color:var(--text-muted);margin-bottom:6px;">No individual names yet.</p>`;

  newIndivRowCount = 0;
  showModal(`
    <div class="modal-title">Edit Member</div>
    <div style="display:flex;gap:8px;">
      <div class="form-group" style="flex:1;">
        <label>Family No. <span style="color:#c00;">*</span></label>
        <input type="text" id="mem-family-edit" value="${m.family_no || ''}" />
      </div>
      <div class="form-group" style="flex:1;">
        <label>No. of Family Members</label>
        <input type="number" id="mem-count-edit" value="${m.family_member_count || ''}" min="1" />
      </div>
    </div>
    <div class="form-group">
      <label>Person Name (Head) <span style="color:#c00;">*</span></label>
      <input type="text" id="mem-name-edit" value="${m.person_name || ''}" />
    </div>
    <div style="display:flex;gap:8px;">
      <div class="form-group" style="flex:1;">
        <label>DOB (Head)</label>
        <input type="date" id="mem-dob-edit" value="${headIndiv?.dob || ''}" onchange="showComputedAge('mem-dob-edit','mem-age-edit')" />
      </div>
      <div class="form-group" style="flex:1;">
        <label>Age <span style="font-weight:400;color:var(--text-muted);">(if DOB unknown)</span></label>
        <input type="number" id="mem-age-edit" min="0" max="130" value="${headIndiv?.age ?? ''}" placeholder="e.g. 62" />
      </div>
      <div class="form-group" style="flex:1;">
        <label>Gender (Head)</label>
        <select id="mem-gender-edit">
          <option value="" ${!headIndiv?.gender ? 'selected' : ''}>—</option>
          <option value="M" ${headIndiv?.gender === 'M' ? 'selected' : ''}>Male</option>
          <option value="F" ${headIndiv?.gender === 'F' ? 'selected' : ''}>Female</option>
          <option value="O" ${headIndiv?.gender === 'O' ? 'selected' : ''}>Other</option>
        </select>
      </div>
    </div>
    <div class="form-group">
      <label>Old Member No. <span style="font-weight:400;color:var(--text-muted);">(from previous register)</span></label>
      <input type="text" id="mem-old-no-edit" value="${m.old_member_no || ''}" placeholder="e.g. 245" />
    </div>
    <div class="form-group">
      <label>Phone No.</label>
      <input type="tel" id="mem-phone-edit" value="${m.phone_no || ''}" placeholder="e.g. 9876543210" />
    </div>
    <div class="form-group">
      <label>Address</label>
      <input type="text" id="mem-address-edit" value="${m.address || ''}" placeholder="e.g. 12, Harinagar Society" />
    </div>
    <div class="modal-actions">
      <button class="btn-primary" onclick="updateMember('${id}')">Update</button>
      <button class="btn-secondary" onclick="closeModal()">Cancel</button>
    </div>
    <hr style="margin:16px 0;border:none;border-top:1px solid var(--border);" />
    <div class="form-group">
      <label>Family Members <span style="font-weight:400;color:var(--text-muted);">(for "Receipt In Name Of")</span></label>
      <div id="fam-indiv-list">${individualsHtml}</div>
      <label style="font-size:13px;font-weight:600;">Add More Members</label>
      <div id="new-indiv-rows" style="margin-top:6px;">${newIndivRowHtml(++newIndivRowCount)}</div>
      <button class="btn-sm btn-secondary" onclick="addNewIndivRow()">+ Add Row</button>
      <button class="btn-sm btn-primary" style="margin-left:6px;" onclick="addFamilyIndividualsFromEdit('${(m.family_no || '').replace(/'/g, "\\'")}','${id}')">💾 Save New Rows</button>
    </div>
  `);
}

async function updateMember(id) {
  const family_no           = document.getElementById('mem-family-edit').value.trim();
  const person_name         = document.getElementById('mem-name-edit').value.trim();
  const phone_no            = document.getElementById('mem-phone-edit').value.trim()   || null;
  const address             = document.getElementById('mem-address-edit').value.trim() || null;
  const family_member_count = parseInt(document.getElementById('mem-count-edit').value) || null;
  const old_member_no       = document.getElementById('mem-old-no-edit').value.trim() || null;
  const dob                 = document.getElementById('mem-dob-edit')?.value || null;
  const age                 = parseInt(document.getElementById('mem-age-edit')?.value) || null;
  const gender              = document.getElementById('mem-gender-edit')?.value || null;

  if (!family_no || !person_name) { showToast('Fill required fields', 'error'); return; }

  const { data: before } = await db.from('dr_members').select('family_no').eq('id', id).single();

  const { error } = await db.from('dr_members')
    .update({ family_no, person_name, phone_no, address, family_member_count, old_member_no })
    .eq('id', id);
  if (error) { showToast('Error: ' + error.message, 'error'); return; }

  // Keep the head's own row in dr_family_individuals (seeded when this
  // family was first added) in sync, so the "Receipt In Name Of" dropdown
  // doesn't keep showing a stale name (or the old family_no) after an edit.
  // dob/gender also live only there (dr_members has no such columns).
  if (before?.family_no) {
    await db.from('dr_family_individuals')
      .update({ person_name, family_no, dob, age, gender })
      .eq('org_id', currentOrgId).eq('family_no', before.family_no).eq('is_head', true);
  }

  closeModal();
  showToast('Member updated!', 'success');
  await Promise.all([loadMembersStats(), loadMembersList()]);
}

async function updateFamilyIndividual(individualId) {
  const name = document.getElementById(`fam-indiv-name-${individualId}`)?.value.trim();
  if (!name) { showToast('Name cannot be blank', 'error'); return; }
  const update = { person_name: name };
  const dobEl = document.getElementById(`fam-indiv-dob-${individualId}`);
  const ageEl = document.getElementById(`fam-indiv-age-${individualId}`);
  const genderEl = document.getElementById(`fam-indiv-gender-${individualId}`);
  const phoneEl = document.getElementById(`fam-indiv-phone-${individualId}`);
  if (dobEl) update.dob = dobEl.value || null;
  if (ageEl) update.age = parseInt(ageEl.value) || null;
  if (genderEl) update.gender = genderEl.value || null;
  if (phoneEl) update.phone_no = phoneEl.value.trim() || null;

  const { error } = await db.from('dr_family_individuals')
    .update(update).eq('id', individualId).eq('org_id', currentOrgId);
  if (error) { showToast('Error: ' + error.message, 'error'); return; }
  showToast('✅ Updated', 'success');
}

async function deleteFamilyIndividualInline(individualId, memberId) {
  if (!confirm('Remove this name?')) return;
  const { error } = await db.from('dr_family_individuals').delete().eq('id', individualId).eq('org_id', currentOrgId);
  if (error) { showToast('Error: ' + error.message, 'error'); return; }
  showToast('Removed');
  showEditMemberModal(memberId);
}

async function addFamilyIndividualsFromEdit(familyNo, memberId) {
  const records = collectNewIndivRows(familyNo);
  if (records.length === 0) { showToast('Enter at least one name', 'error'); return; }
  const { error } = await db.from('dr_family_individuals').insert(records);
  if (error) { showToast('Error: ' + error.message, 'error'); return; }
  showToast(`✅ Added ${records.length} member${records.length > 1 ? 's' : ''}`, 'success');
  showEditMemberModal(memberId);
}

async function deleteMember(id) {
  if (!confirm('Delete this member?')) return;
  const { error } = await db.from('dr_members').delete().eq('id', id);
  if (error) { showToast('Error: ' + error.message, 'error'); return; }
  showToast('Member deleted');
  await Promise.all([loadMembersStats(), loadMembersList()]);
}

// ========== YEARLY MEMBERSHIP FEE ==========
async function showMembershipFeeModal(familyNo, headName) {
  const { data: history } = await db.from('dr_membership_fees')
    .select('id, year, amount, payment_mode, receipt_no, remarks').eq('org_id', currentOrgId).eq('family_no', familyNo)
    .order('year', { ascending: false });

  const paidYears = new Set((history || []).map(h => h.year));
  const currentYear = new Date().getFullYear();
  const nextUnpaidYear = paidYears.has(currentYear) ? currentYear + 1 : currentYear;

  const historyHtml = (history && history.length)
    ? history.map(h => `
        <div style="padding:5px 0;border-bottom:1px solid var(--border);font-size:13px;">
          <div style="display:flex;justify-content:space-between;">
            <span>${h.year}</span>
            <span>₹${parseFloat(h.amount).toLocaleString('en-IN')} ${h.payment_mode === 'online' ? '📱' : '💵'}</span>
            <span style="color:var(--text-muted);">${h.receipt_no ? '#' + h.receipt_no : '—'}</span>
            <button class="btn-sm btn-secondary" onclick="showMembershipFeeReceipt('${h.id}')" title="Print">🖨</button>
          </div>
          ${h.remarks ? `<div style="font-size:11px;color:var(--text-muted);margin-top:2px;">📝 ${h.remarks}</div>` : ''}
        </div>`).join('')
    : `<p style="font-size:12px;color:var(--text-muted);">No membership fee paid yet.</p>`;

  showModal(`
    <div class="modal-title">💳 Membership Fee — ${familyNo}${headName ? ' (' + headName + ')' : ''}</div>
    <div style="max-height:160px;overflow-y:auto;margin-bottom:12px;">${historyHtml}</div>
    <hr style="margin:12px 0;border:none;border-top:1px solid var(--border);" />
    <div style="display:flex;gap:8px;">
      <div class="form-group" style="flex:1;">
        <label>Year</label>
        <input type="number" id="mfee-year" value="${nextUnpaidYear}" min="2000" max="2100" />
      </div>
      <div class="form-group" style="flex:1;">
        <label>Amount (₹)</label>
        <input type="number" id="mfee-amount" min="1" step="0.01" placeholder="e.g. 500" />
      </div>
    </div>
    <div class="form-group">
      <label>Payment Mode</label>
      <select id="mfee-mode" onchange="document.getElementById('mfee-ref-row').style.display=this.value==='online'?'block':'none';">
        <option value="cash">💵 Cash</option>
        <option value="online">📱 Online</option>
      </select>
    </div>
    <div class="form-group" id="mfee-ref-row" style="display:none;">
      <label>Chq/UPI No.</label>
      <input type="text" id="mfee-ref" placeholder="Chq/UPI No." />
    </div>
    <div class="form-group">
      <label>Remarks <span style="font-weight:400;color:var(--text-muted);">(optional)</span></label>
      <input type="text" id="mfee-remarks" placeholder="Any comment" />
    </div>
    <div class="form-group">
      <label>Receipt No. <span style="font-weight:400;color:var(--text-muted);">(manual - leave blank to auto-assign)</span></label>
      <input type="number" id="mfee-receipt-no" min="1" placeholder="e.g. from this year's paper receipt book" />
    </div>
    <div class="modal-actions">
      <button class="btn-primary" onclick="saveMembershipFee('${familyNo.replace(/'/g, "\\'")}','${(headName || '').replace(/'/g, "\\'")}')">💾 Save &amp; Print Receipt</button>
      <button class="btn-secondary" onclick="closeModal()">Close</button>
    </div>
  `);
}

async function saveMembershipFee(familyNo, headName) {
  const year = parseInt(document.getElementById('mfee-year')?.value);
  const amount = parseFloat(document.getElementById('mfee-amount')?.value);
  const payment_mode = document.getElementById('mfee-mode')?.value || 'cash';
  const payment_ref = payment_mode === 'online' ? (document.getElementById('mfee-ref')?.value || '').trim() || null : null;
  const remarks = (document.getElementById('mfee-remarks')?.value || '').trim() || null;
  const manualReceiptNo = parseInt(document.getElementById('mfee-receipt-no')?.value) || null;

  if (!year) { showToast('Enter a valid year', 'error'); return; }
  if (!amount || amount <= 0) { showToast('Enter a valid amount', 'error'); return; }

  const insertObj = { org_id: currentOrgId, family_no: familyNo, year, amount, payment_mode, payment_ref, remarks };
  // This year's receipts were already issued from the paper book before this
  // feature existed - a manually typed number is stored as-is, bypassing the
  // shared auto-counter entirely (getOrAssignReceiptNo in receipt.js already
  // skips assigning when receipt_no is non-null, so printing just uses this
  // number unchanged). Leave blank to fall back to the normal auto-sequence
  // (the plan for next year onward).
  if (manualReceiptNo) {
    insertObj.receipt_no = manualReceiptNo;
    insertObj.receipt_no_assigned_at = new Date().toISOString();
  }

  const { data, error } = await db.from('dr_membership_fees')
    .insert(insertObj)
    .select().single();
  if (error) {
    if (error.code === '23505') { showToast(`${year} fee already recorded for this family`, 'error'); return; }
    showToast('Error: ' + error.message, 'error');
    return;
  }

  closeModal();
  showToast('✅ Membership fee saved');
  await loadMembersList();
  await showMembershipFeeReceipt(data.id);
}

async function showDonorHistory(memberId, memberName, familyNo) {
  showModal(`<div class="modal-title">📜 ${memberName}</div><p style="color:var(--text-muted);font-size:13px;">Loading...</p>`);

  // dr_receipts is never actually written by this app — sourced from
  // dr_donations directly instead (same fix as the Donors tab).
  const [{ data: donations, error }, { data: memberFull }, { data: swapnaTree }, { data: swapnaItems }, { data: generalHeads }] = await Promise.all([
    db.from('dr_donations').select('*').eq('member_id', memberId).eq('org_id', currentOrgId).order('created_at', { ascending: false }),
    db.from('dr_members').select('phone_no').eq('id', memberId).single(),
    db.from('dr_swapna').select('*').eq('org_id', currentOrgId),
    db.from('dr_swapna_items').select('*').eq('org_id', currentOrgId),
    db.from('dr_general_heads').select('*').eq('org_id', currentOrgId).order('display_order')
  ]);
  const memberPhone = (memberFull?.phone_no || '').replace(/\D/g, '');

  reportSwapnaTree = swapnaTree || [];
  reportSwapnaItems = swapnaItems || [];
  reportGeneralHeads = generalHeads || [];
  (donations || []).forEach(d => { if (!d.phone) d.phone = memberPhone || null; });
  reportAllDonations = donations || [];

  if (error || !donations || donations.length === 0) {
    document.getElementById('modal-box').innerHTML = `
      <div class="modal-title">📜 ${memberName}</div>
      <p style="color:var(--text-muted);font-size:13px;text-align:center;padding:20px 0;">No donations found.</p>
      <div class="modal-actions"><button class="btn-secondary" onclick="closeModal()">Close</button></div>
    `;
    return;
  }

  const grandTotal    = donations.reduce((s, d) => s + parseFloat(d.amount || 0), 0);
  const receivedTotal = donations.reduce((s, d) => s + parseFloat(d.received_amount || 0), 0);

  document.getElementById('modal-box').innerHTML = `
    <div class="modal-title">📜 ${memberName}</div>
    <div style="font-size:12px;color:var(--text-muted);margin-bottom:10px;">
      Family No: ${familyNo} &nbsp;·&nbsp; ${donations.length} donation(s)
      ${memberPhone ? `&nbsp;·&nbsp; 📞 ${memberPhone}` : `&nbsp;·&nbsp; <span style="color:#f44;font-weight:600;">⚠ No phone</span>`}
    </div>
    <div style="display:flex;gap:8px;margin-bottom:14px;">
      <div style="flex:1;background:var(--primary);color:white;border-radius:8px;padding:10px;text-align:center;">
        <div style="font-size:10px;opacity:.8;">Total Donated</div>
        <div style="font-size:20px;font-weight:800;">${formatAmount(grandTotal)}</div>
      </div>
      <div style="flex:1;background:#4CAF50;color:white;border-radius:8px;padding:10px;text-align:center;">
        <div style="font-size:10px;opacity:.8;">Received</div>
        <div style="font-size:20px;font-weight:800;">${formatAmount(receivedTotal)}</div>
      </div>
      ${grandTotal > receivedTotal ? `
      <div style="flex:1;background:#ff9800;color:white;border-radius:8px;padding:10px;text-align:center;">
        <div style="font-size:10px;opacity:.8;">Pending</div>
        <div style="font-size:20px;font-weight:800;">${formatAmount(grandTotal - receivedTotal)}</div>
      </div>` : ''}
    </div>
    <div style="max-height:380px;overflow-y:auto;">
      ${donations.map(d => {
        const dt = new Date(d.created_at).toLocaleDateString('en-IN', {day:'2-digit',month:'2-digit',year:'numeric'});
        const headName = getDonationHeadName(d);
        const isReceived = d.received_amount != null && parseFloat(d.received_amount) >= parseFloat(d.amount);
        return `
        <div style="border:1.5px solid var(--border);border-radius:8px;padding:10px 12px;margin-bottom:8px;">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
            <div style="font-size:12px;color:var(--text-muted);max-width:70%;">${headName}</div>
            <span style="font-size:11px;padding:2px 8px;border-radius:10px;font-weight:700;white-space:nowrap;
              background:${isReceived ? '#e8f5e9' : '#fff3e0'};
              color:${isReceived ? '#2e7d32' : '#e65100'};">
              ${isReceived ? '✅ Received' : '⏳ Pending'}
            </span>
          </div>
          <div style="display:flex;justify-content:space-between;align-items:center;">
            <div style="font-size:13px;">
              <strong>${formatAmount(parseFloat(d.amount))}</strong>${d.mun_qty ? ` <span style="font-size:11px;color:var(--text-muted);">(${d.mun_qty} mun)</span>` : ''}
              <span style="font-size:11px;color:var(--text-muted);margin-left:6px;">${dt}</span>
            </div>
            <div style="display:flex;gap:6px;">
              <button class="btn-sm btn-secondary" onclick="showDonationReceipt('${d.id}')">🧾 View</button>
              ${memberPhone ? `<button class="btn-sm" style="background:#25D366;color:white;border:none;border-radius:6px;padding:5px 10px;font-size:12px;cursor:pointer;" onclick="whatsappReportRow('${d.id}')">📲 Send</button>` : ''}
            </div>
          </div>
        </div>`;
      }).join('')}
    </div>
    <div class="modal-actions" style="margin-top:10px;">
      <button class="btn-secondary" onclick="closeModal()">Close</button>
    </div>
  `;
}
