// ==========================================
// DERASAR BOLI - Donation Entry
// ==========================================

let entryEventId = null;
let expandedEntryHeads = {};
let recentEntries = [];
let lastSavedDonationId = null;

async function renderEntry() {
  const content = document.getElementById('page-content');

  const { data: events } = await db
    .from('dr_events')
    .select('*')
    .eq('is_live', true)
    .eq('org_id', currentOrgId)
    .order('created_at', { ascending: false });

  content.innerHTML = `
    <div class="card">
      <div class="card-title">💰 Donation Entry</div>
      <div class="form-group">
        <label>Select Event</label>
        <select id="entry-event" onchange="onEntryEventChange()">
          <option value="">-- Select Live Event --</option>
          ${(events || []).map(ev => `<option value="${ev.id}">${ev.name}</option>`).join('')}
        </select>
        ${(!events || events.length === 0) ? '<p style="color:var(--danger);font-size:12px;margin-top:4px;">No live events. Admin needs to make an event live.</p>' : ''}
      </div>
    </div>

    <!-- Event Donation Heads -->
    <div id="event-heads-section" style="display:none;">
      <div class="card">
        <div class="section-header">
          <h3>🔶 Event Donation Heads</h3>
        </div>
        <div id="event-heads-list">Loading...</div>
      </div>
    </div>

    <!-- General Donation Heads -->
    <div class="card">
      <div class="section-header">
        <h3>🔷 General Donation Heads</h3>
      </div>
      <div id="general-heads-entry">Loading...</div>
    </div>

    <!-- Recent entries -->
    <div class="card">
      <div class="card-title">Recent Entries (This Session)</div>
      <div id="recent-entries"><p style="color:var(--text-muted);font-size:13px;">No entries yet this session.</p></div>
    </div>
  `;

  entryEventId = null;
  expandedEntryHeads = {};
  await loadGeneralHeadsEntry();
}

// ========== EVENT CHANGE ==========
async function onEntryEventChange() {
  entryEventId = document.getElementById('entry-event').value;
  expandedEntryHeads = {};
  if (!entryEventId) {
    document.getElementById('event-heads-section').style.display = 'none';
    return;
  }
  document.getElementById('event-heads-section').style.display = 'block';
  await loadEventHeadsEntry();
}

// ========== EVENT HEADS (3-level collapsible) ==========
async function loadEventHeadsEntry() {
  const el = document.getElementById('event-heads-list');
  if (!el) return;
  el.innerHTML = 'Loading...';

  const { data, error } = await db
    .from('dr_swapna')
    .select('*, dr_swapna_items(*)')
    .eq('event_id', entryEventId)
    .eq('org_id', currentOrgId)
    .order('sort_order');

  if (error || !data || data.length === 0) {
    el.innerHTML = `<div class="empty-state"><p>No heads found for this event.</p></div>`;
    return;
  }

  const topLevel = data.filter(s => !s.parent_id);
  const children = data.filter(s => s.parent_id);

  el.innerHTML = topLevel.map(head => renderEntryMainHead(head, children, data)).join('');
}

function renderEntryMainHead(head, children, allData) {
  const isExpanded = expandedEntryHeads[head.id];
  const myChildren = children.filter(c => c.parent_id === head.id);
  const hasChildren = myChildren.length > 0;
  const hasItems = (head.dr_swapna_items || []).length > 0;

  return `
    <div style="border:2px solid var(--primary);border-radius:10px;margin-bottom:10px;overflow:hidden;">
      <div style="display:flex;align-items:center;justify-content:space-between;padding:12px 16px;background:#ffffff;cursor:pointer;"
           onclick="toggleEntryHead('${head.id}')">
        <strong style="color:var(--primary);font-size:14px;">
          ${isExpanded ? '▼' : '▶'} ${head.name}
        </strong>
      </div>
      ${isExpanded ? `
        <div style="padding:8px 12px 12px 20px;">
          ${hasChildren ? myChildren.sort((a,b)=>(a.sort_order||0)-(b.sort_order||0))
            .map(child => renderEntryChildHead(child, allData)).join('') : ''}
          ${hasItems ? renderEntrySwapnaItems(head) : ''}
          ${!hasChildren && !hasItems ? renderEntryAddButton(head.id, head.name, 'swapna') : ''}
        </div>
      ` : ''}
    </div>
  `;
}

function renderEntryChildHead(child, allData) {
  const isExpanded = expandedEntryHeads[child.id];
  const grandChildren = allData.filter(s => s.parent_id === child.id);
  const hasGrandChildren = grandChildren.length > 0;
  const hasItems = (child.dr_swapna_items || []).length > 0;

  return `
    <div style="border:1.5px solid var(--border);border-radius:8px;margin-bottom:8px;overflow:hidden;">
      <div style="display:flex;align-items:center;justify-content:space-between;padding:10px 12px;background:#fafafa;cursor:pointer;"
           onclick="toggleEntryHead('${child.id}')">
        <span style="color:var(--primary);font-size:13px;font-weight:600;">
          ${isExpanded ? '▼' : '▶'} ${child.name}
        </span>
      </div>
      ${isExpanded ? `
        <div style="padding:6px 12px 10px 20px;">
          ${hasGrandChildren ? grandChildren.sort((a,b)=>(a.sort_order||0)-(b.sort_order||0))
            .map(gc => renderEntryLeafHead(gc)).join('') : ''}
          ${hasItems ? renderEntrySwapnaItems(child) : ''}
          ${!hasGrandChildren && !hasItems ? renderEntryAddButton(child.id, child.name, 'swapna') : ''}
        </div>
      ` : ''}
    </div>
  `;
}

function renderEntryLeafHead(item) {
  const isExpanded = expandedEntryHeads[item.id];
  const hasItems = (item.dr_swapna_items || []).length > 0;

  return `
    <div style="border:1px solid var(--border);border-radius:6px;margin-bottom:6px;overflow:hidden;">
      <div style="display:flex;align-items:center;justify-content:space-between;padding:8px 12px;background:#fff;cursor:pointer;"
           onclick="toggleEntryHead('${item.id}')">
        <span style="font-size:13px;color:var(--text);">
          ${isExpanded ? '▼' : '▶'} ${item.name}
        </span>
      </div>
      ${isExpanded ? `
        <div style="padding:6px 12px 8px 20px;">
          ${hasItems ? renderEntrySwapnaItems(item) : renderEntryAddButton(item.id, item.name, 'swapna')}
        </div>
      ` : ''}
    </div>
  `;
}

function renderEntrySwapnaItems(swapna) {
  const items = (swapna.dr_swapna_items || []).sort((a,b)=>(a.sort_order||0)-(b.sort_order||0));
  return items.map(item => `
    <div style="padding:6px 0;display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid var(--border);">
      <span style="font-size:13px;">• ${item.name}</span>
      <button class="btn-accent btn-sm" onclick="showDonationModal('${item.id}','${(swapna.name+' → '+item.name).replace(/'/g,"\\'")}','swapna_item',null)">+ Add</button>
    </div>
  `).join('');
}

function renderEntryAddButton(id, name, type) {
  return `
    <div style="padding:8px 0;">
      <button class="btn-accent btn-sm" onclick="showDonationModal('${id}','${name.replace(/'/g,"\\'")}','${type}',null)">+ Add Donation</button>
    </div>
  `;
}

async function toggleEntryHead(id) {
  expandedEntryHeads[id] = !expandedEntryHeads[id];
  await loadEventHeadsEntry();
}

// ========== GENERAL HEADS ENTRY ==========
async function loadGeneralHeadsEntry() {
  const { data, error } = await db
    .from('dr_general_heads')
    .select('*')
    .eq('org_id', currentOrgId)
    .order('display_order');

  const el = document.getElementById('general-heads-entry');
  if (!el) return;

  if (error || !data || data.length === 0) {
    el.innerHTML = `<p style="color:var(--text-muted);font-size:13px;">No general heads found.</p>`;
    return;
  }

  el.innerHTML = data.map(h => `
    <div style="display:flex;align-items:center;justify-content:space-between;padding:10px 0;border-bottom:1px solid var(--border);">
      <span style="font-size:14px;color:var(--text);">${h.name}</span>
      <button class="btn-accent btn-sm" onclick="showDonationModal('${h.id}','${h.name.replace(/'/g,"\\'")}','general',null)">+ Add</button>
    </div>
  `).join('');
}

// ========== DONATION MODAL ==========
function showDonationModal(headId, headName, headType, prefillMemberId) {
  showModal(`
    <div class="modal-title">+ Add Donation</div>
    <div style="font-size:12px;color:var(--text-muted);margin-bottom:12px;">${headName}</div>

    <div class="form-group">
      <label>Donor Type</label>
      <select id="modal-donor-type" onchange="onModalDonorTypeChange()" onclick="onModalDonorTypeChange()">
        <option value="">-- Select --</option>
        <option value="other">Other (Type Name)</option>
        <option value="member">Member (Search)</option>
      </select>
    </div>

    <div id="modal-other-fields" style="display:none;">
      <div class="form-group">
        <label>Name</label>
        <input type="text" id="modal-other-name" placeholder="Donor name" />
      </div>
      <div class="form-group">
        <label>Phone No. (10 digits — optional)</label>
        <div style="display:flex;gap:4px;justify-content:center;margin-top:6px;" id="phone-boxes">
          ${[...Array(10)].map((_,i) => `
            <input type="tel" inputmode="numeric" maxlength="1"
              id="ph-${i}"
              oninput="phoneBoxInput(this,${i})"
              onkeydown="phoneBoxKey(event,${i})"
              onpaste="phoneBoxPaste(event,${i})"
              style="width:28px;height:36px;text-align:center;font-size:16px;font-weight:700;border:2px solid var(--border);border-radius:6px;outline:none;padding:0;"
            />
          `).join('')}
        </div>
        <input type="hidden" id="modal-other-phone" />
      </div>
    </div>

    <div id="modal-member-fields" style="display:none;">
      <div class="form-group">
        <label>Search Member</label>
        <input type="text" id="modal-member-search" placeholder="Type name or family no..." oninput="searchModalMember()" />
        <div id="modal-member-results" style="max-height:150px;overflow-y:auto;border:1px solid var(--border);border-radius:6px;margin-top:4px;display:none;"></div>
      </div>
      <div id="modal-selected-member" style="display:none;padding:8px;background:#FFF8F0;border-radius:6px;border:1.5px solid var(--accent);margin-bottom:8px;">
        <strong id="modal-selected-name"></strong>
        <span id="modal-selected-family" style="font-size:12px;color:var(--text-muted);margin-left:8px;"></span>
        <button class="btn-sm" style="float:right;background:#eee;color:#333;font-size:11px;" onclick="clearModalMember()">Change</button>
      </div>
    </div>

    <div class="form-group">
      <label>Amount (₹)</label>
      <input type="number" id="modal-amount" placeholder="0" min="1" inputmode="numeric" />
    </div>

    <div class="modal-actions">
      <button class="btn-primary" onclick="saveDonationFromModal('${headId}','${headName.replace(/'/g,"\\'")}','${headType}')">✅ Save</button>
      <button class="btn-secondary" onclick="closeModal()">Cancel</button>
    </div>
  `);
}

function onModalDonorTypeChange() {
  const type = document.getElementById('modal-donor-type').value;
  document.getElementById('modal-other-fields').style.display = type === 'other' ? 'block' : 'none';
  document.getElementById('modal-member-fields').style.display = type === 'member' ? 'block' : 'none';
}

// ========== 10-BOX PHONE INPUT ==========
function phoneBoxInput(el, index) {
  el.value = el.value.replace(/[^0-9]/g, "");
  if (el.value.length === 1 && index < 9) {
    document.getElementById("ph-" + (index + 1)).focus();
  }
  updateHiddenPhone();
}

function phoneBoxKey(e, index) {
  if (e.key === "Backspace") {
    const el = document.getElementById("ph-" + index);
    if (!el.value && index > 0) {
      document.getElementById("ph-" + (index - 1)).focus();
    }
    updateHiddenPhone();
  }
}

function phoneBoxPaste(e, startIndex) {
  e.preventDefault();
  const pasted = (e.clipboardData || window.clipboardData).getData("text").replace(/[^0-9]/g, "");
  for (let i = 0; i < pasted.length && (startIndex + i) < 10; i++) {
    document.getElementById("ph-" + (startIndex + i)).value = pasted[i];
  }
  updateHiddenPhone();
  const next = Math.min(startIndex + pasted.length, 9);
  document.getElementById("ph-" + next).focus();
}

function updateHiddenPhone() {
  let val = "";
  for (let i = 0; i < 10; i++) {
    const box = document.getElementById("ph-" + i);
    if (box) val += box.value;
  }
  const hidden = document.getElementById("modal-other-phone");
  if (hidden) hidden.value = val;
  for (let i = 0; i < 10; i++) {
    const box = document.getElementById("ph-" + i);
    if (box) box.style.borderColor = box.value ? "var(--primary)" : "var(--border)";
  }
}

let modalMemberTimer = null;
let modalSelectedMember = null;

function searchModalMember() {
  clearTimeout(modalMemberTimer);
  modalMemberTimer = setTimeout(async () => {
    const q = document.getElementById('modal-member-search').value.trim();
    const resultsEl = document.getElementById('modal-member-results');
    if (q.length < 1) { resultsEl.style.display = 'none'; return; }

    const { data } = await db
      .from('dr_members')
      .select('*')
      .eq('org_id', currentOrgId)
      .or(`person_name.ilike.%${q}%,family_no.ilike.%${q}%`)
      .limit(8);

    if (!data || data.length === 0) {
      resultsEl.innerHTML = '<p style="padding:8px;font-size:13px;color:var(--text-muted);">No members found.</p>';
      return;
    }

    resultsEl.style.display = 'block';
    resultsEl.innerHTML = data.map(m => `
      <div style="padding:8px 10px;cursor:pointer;border-bottom:1px solid var(--border);font-size:13px;"
           onmouseover="this.style.background='#FFF8F0'" onmouseout="this.style.background=''"
           onclick="selectModalMember('${m.id}','${m.person_name.replace(/'/g,"\\'")}','${m.family_no}')">
        <strong>${m.person_name}</strong>
        <span style="color:var(--text-muted);margin-left:6px;">Family: ${m.family_no}</span>
      </div>
    `).join('');
  }, 300);
}

function selectModalMember(id, name, familyNo) {
  modalSelectedMember = { id, name, familyNo };
  document.getElementById('modal-member-results').style.display = 'none';
  document.getElementById('modal-member-search').value = '';
  document.getElementById('modal-selected-member').style.display = 'block';
  document.getElementById('modal-selected-name').textContent = name;
  document.getElementById('modal-selected-family').textContent = 'Family: ' + familyNo;
}

function clearModalMember() {
  modalSelectedMember = null;
  document.getElementById('modal-selected-member').style.display = 'none';
  document.getElementById('modal-member-search').value = '';
  document.getElementById('modal-member-results').style.display = 'none';
}

async function saveDonationFromModal(headId, headName, headType) {
  const donorType = document.getElementById('modal-donor-type').value;
  const amount = parseFloat(document.getElementById('modal-amount').value);
  const note = '';

  if (!donorType) { showToast('Select donor type', 'error'); return; }
  if (!amount || amount <= 0) { showToast('Enter valid amount', 'error'); return; }

  let donorName = null;
  let phone = null;
  let memberId = null;
  let familyNo = null;

  if (donorType === 'other') {
    donorName = document.getElementById('modal-other-name').value.trim();
    phone = document.getElementById('modal-other-phone').value.trim();
    if (!donorName) { showToast('Enter donor name', 'error'); return; }
    if (phone && phone.length !== 10) { showToast('Phone must be exactly 10 digits or leave empty', 'error'); return; }
    if (!phone) phone = null;
  } else if (donorType === 'member') {
    if (!modalSelectedMember) { showToast('Select a member', 'error'); return; }
    memberId = modalSelectedMember.id;
    donorName = modalSelectedMember.name;
    familyNo = modalSelectedMember.familyNo;
  }

  const record = {
    event_id: headType !== 'general' ? entryEventId : null,
    head_type: headType === 'swapna_item' ? 'swapna_item' : headType === 'swapna' ? 'swapna' : 'general_head',
    swapna_item_id: headType === 'swapna_item' ? headId : null,
    swapna_id: headType === 'swapna' ? headId : null,
    general_head_id: headType === 'general' ? headId : null,
    member_id: memberId || null,
    donor_name: donorName,
    family_no: familyNo || null,
    phone: phone || null,
    amount,
    note: note || null,
    entered_by: currentUser?.id || null,
    org_id: currentOrgId
  };

  const { data: saved, error } = await db.from('dr_donations').insert(record).select().single();
  if (error) { showToast('Error: ' + error.message, 'error'); return; }

  lastSavedDonationId = saved.id;
  modalSelectedMember = null;
  closeModal();
  showToast(`✅ Saved! ${donorName} → ₹${amount}`, 'success');

  recentEntries.unshift({
    id: saved.id,
    donor: donorName,
    family: familyNo || '—',
    phone: phone || '—',
    head: headName,
    amount
  });

  updateRecentEntries();

  // Refresh the relevant section
  if (headType === 'general') {
    await loadGeneralHeadsEntry();
  } else {
    await loadEventHeadsEntry();
  }
}

function updateRecentEntries() {
  const el = document.getElementById('recent-entries');
  if (!el || recentEntries.length === 0) return;
  el.innerHTML = `
    <div style="overflow-x:auto;">
      <table class="data-table">
        <thead>
          <tr><th>Donor</th><th>Phone</th><th>Head</th><th>Amount</th><th>Actions</th></tr>
        </thead>
        <tbody>
          ${recentEntries.slice(0, 10).map(e => `
            <tr>
              <td>${e.donor}</td>
              <td>${e.phone || '—'}</td>
              <td style="font-size:12px;">${e.head}</td>
              <td><strong>${formatAmount(e.amount)}</strong></td>
              <td>
                <div style="display:flex;gap:4px;">
                  <button class="btn-sm btn-secondary" onclick="showDonationReceipt('${e.id}')">🧾</button>
                  <button class="btn-sm" style="background:#25D366;color:white;" onclick="whatsappDonation('${e.id}')">📲</button>
                  ${isAdmin() ? `<button class="btn-sm btn-danger" onclick="deleteDonation('${e.id}','entry')">✕</button>` : ''}
                </div>
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;
}

function whatsappDonation(id) {
  const e = recentEntries.find(r => r.id === id);
  if (!e) return;
  const msg = `🛕 *Derasar Boli - Donation Receipt*\n\n` +
    `👤 Donor: ${e.donor}\n` +
    `📱 Phone: ${e.phone || '—'}\n` +
    `🏠 Family: ${e.family || '—'}\n` +
    `📋 Head: ${e.head}\n` +
    `💰 Amount: ${formatAmount(e.amount)}\n\n` +
    `🙏 Jai Jinendra`;
  window.open('https://wa.me/?text=' + encodeURIComponent(msg), '_blank');
}

function printLastReceipt() {
  if (lastSavedDonationId) showDonationReceipt(lastSavedDonationId);
}

// ========== EDIT / DELETE DONATIONS ==========
async function showEditDonationModal(id, refreshFn) {
  const { data: d, error } = await db.from('dr_donations').select('*').eq('id', id).eq('org_id', currentOrgId).single();
  if (error || !d) { showToast('Could not load', 'error'); return; }

  showModal(`
    <div class="modal-title">Edit Donation</div>
    <div style="font-size:13px;color:var(--text-muted);margin-bottom:14px;">
      <strong>${d.donor_name}</strong>${d.family_no ? ' · Family: ' + d.family_no : ''}
    </div>
    <div class="form-group">
      <label>Donor Name</label>
      <input type="text" id="edit-don-name" value="${d.donor_name || ''}" />
    </div>
    <div class="form-group">
      <label>Phone</label>
      <input type="tel" id="edit-don-phone" value="${d.phone || ''}" placeholder="Mobile number" />
    </div>
    <div class="form-group">
      <label>Amount</label>
      <input type="number" id="edit-don-amount" value="${d.amount}" min="1" />
    </div>
    <div class="modal-actions">
      <button class="btn-primary" onclick="updateDonation('${id}','${refreshFn}')">Update</button>
      <button class="btn-secondary" onclick="closeModal()">Cancel</button>
    </div>
  `);
}

async function updateDonation(id, refreshFn) {
  const amount = parseFloat(document.getElementById('edit-don-amount').value);
  const donor_name = document.getElementById('edit-don-name').value.trim();
  const phone = document.getElementById('edit-don-phone').value.trim();

  if (!amount || amount <= 0) { showToast('Enter valid amount', 'error'); return; }

  const { error } = await db.from('dr_donations')
    .update({ amount, donor_name, phone: phone || null })
    .eq('id', id).eq('org_id', currentOrgId);
  if (error) { showToast('Error: ' + error.message, 'error'); return; }

  closeModal();
  showToast('Donation updated!', 'success');
  if (refreshFn === 'live') loadLiveData();
  else if (refreshFn === 'reports') loadReport();
}

async function deleteDonation(id, refreshFn) {
  if (!confirm('Delete this donation entry? This cannot be undone.')) return;
  const { error } = await db.from('dr_donations').delete().eq('id', id).eq('org_id', currentOrgId);
  if (error) { showToast('Error: ' + error.message, 'error'); return; }
  showToast('Donation deleted');
  if (refreshFn === 'live') loadLiveData();
  else if (refreshFn === 'reports') loadReport();
  else if (refreshFn === 'entry') {
    recentEntries = recentEntries.filter(e => e.id !== id);
    updateRecentEntries();
  }
}
