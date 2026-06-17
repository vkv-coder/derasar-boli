// ==========================================
// DERASAR BOLI - Members
// ==========================================

async function renderMembers() {
  const content = document.getElementById('page-content');
  content.innerHTML = `
    <div class="card">
      <div class="section-header">
        <h3>Members List</h3>
        <button class="btn-accent btn-sm" onclick="showAddMemberModal()">+ Add Member</button>
      </div>
      <div class="search-box" style="margin-bottom:14px;">
        <input type="text" id="member-search" placeholder="Search by name or family no..." oninput="searchMembers()" />
      </div>
      <div id="members-list">Loading...</div>
    </div>
  `;
  await loadMembersList();
}

async function loadMembersList(query = '') {
  let req = db.from('members').select('*').order('family_no');
  if (query) req = req.or(`person_name.ilike.%${query}%,family_no.ilike.%${query}%`);
  const { data, error } = await req;

  const el = document.getElementById('members-list');
  if (error || !data || data.length === 0) {
    el.innerHTML = `<div class="empty-state"><div class="empty-icon">👥</div><p>No members found.</p></div>`;
    return;
  }

  el.innerHTML = `
    <table class="data-table">
      <thead>
        <tr><th>Family No.</th><th>Person Name</th><th>Actions</th></tr>
      </thead>
      <tbody>
        ${data.map(m => `
          <tr>
            <td><strong>${m.family_no}</strong></td>
            <td>${m.person_name}</td>
            <td>
              <div style="display:flex;gap:6px;flex-wrap:wrap;">
                <button class="btn-sm btn-secondary" onclick="showDonorHistory('${m.id}','${m.person_name.replace(/'/g,"\\'")}','${m.family_no}')">📜 History</button>
                <button class="btn-sm" style="background:#4CAF50;color:white;" onclick="showEditMemberModal('${m.id}','${m.family_no}','${m.person_name.replace(/'/g,"\\'")}')">Edit</button>
                <button class="btn-sm btn-danger" onclick="deleteMember('${m.id}')">Delete</button>
              </div>
            </td>
          </tr>
        `).join('')}
      </tbody>
    </table>
    <p style="font-size:12px;color:var(--text-muted);margin-top:10px;">Total: ${data.length} members</p>
  `;
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
    <div class="form-group">
      <label>Family No.</label>
      <input type="text" id="mem-family" placeholder="e.g. 101" />
    </div>
    <div class="form-group">
      <label>Person Name</label>
      <input type="text" id="mem-name" placeholder="Full name" />
    </div>
    <div class="modal-actions">
      <button class="btn-primary" onclick="addMember()">Save</button>
      <button class="btn-secondary" onclick="closeModal()">Cancel</button>
    </div>
  `);
}

async function addMember(familyNo = null, personName = null) {
  const family_no = familyNo || document.getElementById('mem-family').value.trim();
  const person_name = personName || document.getElementById('mem-name').value.trim();
  if (!family_no || !person_name) { showToast('Fill all fields', 'error'); return null; }

  const { data, error } = await db.from('members').insert({ family_no, person_name }).select().single();
  if (error) { showToast('Error: ' + error.message, 'error'); return null; }

  if (!familyNo) {
    closeModal();
    showToast('Member added!', 'success');
    await loadMembersList();
  }
  return data;
}

function showEditMemberModal(id, familyNo, personName) {
  showModal(`
    <div class="modal-title">Edit Member</div>
    <div class="form-group">
      <label>Family No.</label>
      <input type="text" id="mem-family-edit" value="${familyNo}" />
    </div>
    <div class="form-group">
      <label>Person Name</label>
      <input type="text" id="mem-name-edit" value="${personName}" />
    </div>
    <div class="modal-actions">
      <button class="btn-primary" onclick="updateMember('${id}')">Update</button>
      <button class="btn-secondary" onclick="closeModal()">Cancel</button>
    </div>
  `);
}

async function updateMember(id) {
  const family_no = document.getElementById('mem-family-edit').value.trim();
  const person_name = document.getElementById('mem-name-edit').value.trim();
  if (!family_no || !person_name) { showToast('Fill all fields', 'error'); return; }
  const { error } = await db.from('members').update({ family_no, person_name }).eq('id', id);
  if (error) { showToast('Error: ' + error.message, 'error'); return; }
  closeModal();
  showToast('Member updated!', 'success');
  await loadMembersList();
}

async function deleteMember(id) {
  if (!confirm('Delete this member?')) return;
  await db.from('members').delete().eq('id', id);
  showToast('Member deleted');
  await loadMembersList();
}

// ========== DONOR HISTORY ==========
async function showDonorHistory(memberId, memberName, familyNo) {
  showModal(`<div class="modal-title">📜 ${memberName}</div><p style="color:var(--text-muted);font-size:13px;">Loading history...</p>`);

  const { data: donations, error } = await db
    .from('donations')
    .select('*, events(name)')
    .eq('member_id', memberId)
    .order('created_at', { ascending: false });

  if (error || !donations || donations.length === 0) {
    document.getElementById('modal-box').innerHTML = `
      <div class="modal-title">📜 ${memberName}</div>
      <p style="color:var(--text-muted);font-size:13px;text-align:center;padding:20px 0;">No donation history found.</p>
      <div class="modal-actions"><button class="btn-secondary" onclick="closeModal()">Close</button></div>
    `;
    return;
  }

  const totalAmount = donations.reduce((s, d) => s + parseFloat(d.amount), 0);

  // Group by event
  const byEvent = {};
  donations.forEach(d => {
    const evName = d.events?.name || 'Unknown Event';
    if (!byEvent[evName]) byEvent[evName] = [];
    byEvent[evName].push(d);
  });

  document.getElementById('modal-box').innerHTML = `
    <div class="modal-title">📜 ${memberName}</div>
    <div style="font-size:12px;color:var(--text-muted);margin-bottom:12px;">Family No: ${familyNo} &nbsp;·&nbsp; ${donations.length} donations</div>

    <div style="background:var(--primary);color:white;border-radius:8px;padding:12px;text-align:center;margin-bottom:14px;">
      <div style="font-size:11px;opacity:.8;">Total Donated (All Time)</div>
      <div style="font-size:26px;font-weight:800;">${formatAmount(totalAmount)}</div>
    </div>

    <div style="max-height:340px;overflow-y:auto;">
      ${Object.entries(byEvent).map(([evName, evDonations]) => {
        const evTotal = evDonations.reduce((s, d) => s + parseFloat(d.amount), 0);
        return `
          <div style="margin-bottom:12px;">
            <div style="font-size:12px;font-weight:700;color:var(--primary);padding:6px 0;border-bottom:1.5px solid var(--border);display:flex;justify-content:space-between;">
              <span>📅 ${evName}</span>
              <span>${formatAmount(evTotal)}</span>
            </div>
            ${evDonations.map(d => `
              <div style="padding:7px 0;border-bottom:1px solid var(--border);font-size:13px;display:flex;justify-content:space-between;align-items:center;">
                <div>
                  <div style="font-weight:600;">${formatAmount(d.amount)}</div>
                  <div style="font-size:11px;color:var(--text-muted);">${new Date(d.created_at).toLocaleDateString('en-IN')}${d.note ? ' · ' + d.note : ''}</div>
                </div>
                <button class="btn-sm btn-secondary" onclick="showDonationReceipt('${d.id}')" title="View Receipt">🧾</button>
              </div>
            `).join('')}
          </div>
        `;
      }).join('')}
    </div>

    <div class="modal-actions" style="margin-top:12px;">
      <button class="btn-secondary" onclick="closeModal()">Close</button>
    </div>
  `;
}
