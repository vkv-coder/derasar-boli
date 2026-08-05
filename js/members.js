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
        <input type="text" id="member-search" placeholder="Search by name, family no or phone..." oninput="searchMembers()" />
      </div>
      <div id="members-list">Loading...</div>
    </div>
  `;
  await Promise.all([loadMembersStats(), loadMembersList()]);
}

async function loadMembersStats() {
  const { data } = await db.from('dr_members').select('family_no, phone_no, family_member_count').eq('org_id', currentOrgId);
  const el = document.getElementById('members-stats');
  if (!el || !data) return;
  const uniqueFamilies = new Set(data.map(m => m.family_no).filter(Boolean)).size;
  const totalPersons   = data.reduce((s, m) => s + (m.family_member_count || 0), 0);
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
  if (query) req = req.or(`person_name.ilike.%${query}%,family_no.ilike.%${query}%,phone_no.ilike.%${query}%`);
  const { data: raw, error } = await req;
  const data = raw ? sortFamilyNo(raw) : raw;

  const el = document.getElementById('members-list');
  if (error || !data || data.length === 0) {
    el.innerHTML = `<div class="empty-state"><div class="empty-icon">👥</div><p>No members found.</p></div>`;
    return;
  }

  el.innerHTML = `
    <div style="overflow-x:auto;">
    <table class="data-table">
      <thead>
        <tr><th>Family No.</th><th>Name</th><th>Phone</th><th>Members</th><th>Actions</th></tr>
      </thead>
      <tbody>
        ${data.map(m => `
          <tr>
            <td><strong>${m.family_no}</strong></td>
            <td>${m.person_name}${m.address ? `<div style="font-size:11px;color:var(--text-muted);">${m.address}</div>` : ''}</td>
            <td>${m.phone_no
              ? `<a href="tel:${m.phone_no}" style="color:var(--primary);text-decoration:none;">${m.phone_no}</a>`
              : '<span style="color:#f44;font-size:11px;">⚠ Missing</span>'}</td>
            <td style="text-align:center;">${m.family_member_count || '—'}</td>
            <td>
              <div style="display:flex;gap:5px;flex-wrap:wrap;">
                <button class="btn-sm btn-secondary" onclick="showDonorHistory('${m.id}','${m.person_name.replace(/'/g,"\\'")}','${(m.family_no||'').replace(/'/g,"\\'")}')">📜</button>
                <button class="btn-sm" style="background:#4CAF50;color:white;" onclick="showEditMemberModal('${m.id}')">Edit</button>
                <button class="btn-sm btn-danger" onclick="deleteMember('${m.id}')">Del</button>
              </div>
            </td>
          </tr>
        `).join('')}
      </tbody>
    </table>
    </div>
    <p style="font-size:12px;color:var(--text-muted);margin-top:10px;">${data.length} families
      &nbsp;·&nbsp; ${data.reduce((s,m)=>s+(m.family_member_count||0),0)} persons
      &nbsp;·&nbsp; Missing phone: ${data.filter(m => !m.phone_no).length}
    </p>
  `;
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
    ['Family No.', 'Name', 'Phone', 'Address', 'Family Member Count']
  ];
  data.forEach(m => {
    rows.push([m.family_no || '', m.person_name || '', m.phone_no || '', m.address || '', m.family_member_count || '']);
  });

  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!cols'] = [{wch:10},{wch:32},{wch:14},{wch:32},{wch:12}];
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
        <input type="text" id="mem-family" placeholder="e.g. 101" />
      </div>
      <div class="form-group" style="flex:1;">
        <label>No. of Family Members</label>
        <input type="number" id="mem-count" placeholder="e.g. 4" min="1" />
      </div>
    </div>
    <div class="form-group">
      <label>Person Name <span style="color:#c00;">*</span></label>
      <input type="text" id="mem-name" placeholder="Full name" />
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
      <button class="btn-primary" onclick="addMember()">Save</button>
      <button class="btn-secondary" onclick="closeModal()">Cancel</button>
    </div>
  `);
}

async function addMember(familyNo = null, personName = null) {
  const family_no           = familyNo   || document.getElementById('mem-family')?.value.trim();
  const person_name         = personName || document.getElementById('mem-name')?.value.trim();
  const phone_no            = document.getElementById('mem-phone')?.value.trim()   || null;
  const address             = document.getElementById('mem-address')?.value.trim() || null;
  const family_member_count = parseInt(document.getElementById('mem-count')?.value) || null;

  if (!family_no || !person_name) { showToast('Family No. and Name are required', 'error'); return null; }

  const { data, error } = await db.from('dr_members')
    .insert({ family_no, person_name, phone_no, address, family_member_count, org_id: currentOrgId })
    .select().single();
  if (error) { showToast('Error: ' + error.message, 'error'); return null; }

  if (!familyNo) {
    closeModal();
    showToast('Member added!', 'success');
    await Promise.all([loadMembersStats(), loadMembersList()]);
  }
  return data;
}

async function showEditMemberModal(id) {
  const { data: m, error } = await db.from('dr_members').select('*').eq('id', id).single();
  if (error || !m) { showToast('Could not load member', 'error'); return; }

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
      <label>Person Name <span style="color:#c00;">*</span></label>
      <input type="text" id="mem-name-edit" value="${m.person_name || ''}" />
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
  `);
}

async function updateMember(id) {
  const family_no           = document.getElementById('mem-family-edit').value.trim();
  const person_name         = document.getElementById('mem-name-edit').value.trim();
  const phone_no            = document.getElementById('mem-phone-edit').value.trim()   || null;
  const address             = document.getElementById('mem-address-edit').value.trim() || null;
  const family_member_count = parseInt(document.getElementById('mem-count-edit').value) || null;

  if (!family_no || !person_name) { showToast('Fill required fields', 'error'); return; }
  const { error } = await db.from('dr_members')
    .update({ family_no, person_name, phone_no, address, family_member_count })
    .eq('id', id);
  if (error) { showToast('Error: ' + error.message, 'error'); return; }
  closeModal();
  showToast('Member updated!', 'success');
  await Promise.all([loadMembersStats(), loadMembersList()]);
}

async function deleteMember(id) {
  if (!confirm('Delete this member?')) return;
  const { error } = await db.from('dr_members').delete().eq('id', id);
  if (error) { showToast('Error: ' + error.message, 'error'); return; }
  showToast('Member deleted');
  await Promise.all([loadMembersStats(), loadMembersList()]);
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
