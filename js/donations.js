// ==========================================
// DERASAR BOLI - Donation Entry
// ==========================================

let entryState = {
  eventId: null,
  headType: null,
  headId: null,
  headName: null,
  memberId: null,
  memberName: null,
  familyNo: null
};

async function renderEntry() {
  const content = document.getElementById('page-content');

  const { data: events } = await db
    .from('events')
    .select('*')
    .eq('is_live', true)
    .order('created_at', { ascending: false });

  content.innerHTML = `
    <div class="card">
      <div class="card-title">💰 Donation Entry</div>

      <!-- Step 1: Event -->
      <div class="form-group">
        <label>Step 1: Select Event</label>
        <select id="entry-event" onchange="onEntryEventChange()">
          <option value="">-- Select Live Event --</option>
          ${(events || []).map(ev => `<option value="${ev.id}">${ev.name}</option>`).join('')}
        </select>
        ${(!events || events.length === 0) ? '<p style="color:var(--danger);font-size:12px;margin-top:4px;">No live events. Admin needs to make an event live.</p>' : ''}
      </div>

      <!-- Step 2: Head -->
      <div id="entry-head-section" style="display:none;">
        <div class="form-group">
          <label>Step 2: Select Donation Head</label>
          <select id="entry-head-type" onchange="onHeadTypeChange()">
            <option value="">-- Select Type --</option>
            <option value="swapna">🔶 Swapna (Auction)</option>
            <option value="general">🔷 General Head</option>
          </select>
        </div>
        <div id="entry-head-detail" style="display:none;"></div>
      </div>

      <!-- Step 3: Donor -->
      <div id="entry-donor-section" style="display:none;">
        <div class="card-title" style="margin-top:16px;">Step 3: Donor</div>
        <div class="search-box">
          <input type="text" id="donor-search" placeholder="Search member by name or family no..." oninput="searchDonor()" />
        </div>
        <div id="donor-search-results"></div>
        <div id="selected-donor" style="display:none;margin-bottom:10px;padding:10px;background:#FFF8F0;border-radius:8px;border:1.5px solid var(--accent);">
          <strong id="selected-donor-name"></strong>
          <span id="selected-donor-family" style="font-size:12px;color:var(--text-muted);margin-left:8px;"></span>
          <button class="btn-sm" style="float:right;background:#eee;color:#333;" onclick="clearDonor()">Change</button>
        </div>
        <div id="new-donor-section" style="display:none;">
          <p style="font-size:12px;color:var(--text-muted);margin-bottom:8px;">Or add new donor:</p>
          <div style="display:flex;gap:8px;">
            <input type="text" id="new-family-no" placeholder="Family No." style="width:120px;padding:8px;border:1.5px solid var(--border);border-radius:6px;" />
            <input type="text" id="new-person-name" placeholder="Person Name" style="flex:1;padding:8px;border:1.5px solid var(--border);border-radius:6px;" />
            <button class="btn-accent btn-sm" onclick="addNewDonorInline()">Add</button>
          </div>
        </div>
      </div>

      <!-- Step 4: Amount -->
      <div id="entry-amount-section" style="display:none;margin-top:16px;">
        <div class="form-group">
          <label>Step 4: Amount</label>
          <div class="amount-input-wrap">
            <input type="number" id="entry-amount" placeholder="0" min="1" />
          </div>
        </div>
        <div class="form-group">
          <label>Note (optional)</label>
          <input type="text" id="entry-note" placeholder="Any note..." />
        </div>
        <button class="btn-primary" style="margin-top:8px;" onclick="saveDonation()">✅ Save Donation</button>
      </div>
    </div>

    <!-- Post-save actions -->
    <div id="post-save-card" style="display:none;" class="card">
      <div class="card-title">✅ Donation Saved!</div>
      <p id="post-save-summary" style="font-size:14px;color:var(--text-light);margin-bottom:14px;"></p>
      <div style="display:flex;gap:10px;flex-wrap:wrap;">
        <button class="btn-secondary" onclick="printLastReceipt()">🧾 Receipt (Gujarati)</button>
        <button class="btn-accent" style="background:#25D366;color:white;" onclick="whatsappLastDonation()">📲 Share on WhatsApp</button>
      </div>
    </div>

    <!-- Recent entries -->
    <div class="card">
      <div class="card-title">Recent Entries (This Session)</div>
      <div id="recent-entries"><p style="color:var(--text-muted);font-size:13px;">No entries yet this session.</p></div>
    </div>
  `;

  entryState = { eventId: null, headType: null, headId: null, headName: null, memberId: null, memberName: null, familyNo: null };
}

function onEntryEventChange() {
  entryState.eventId = document.getElementById('entry-event').value;
  entryState.headType = null;
  entryState.headId = null;
  document.getElementById('entry-head-section').style.display = entryState.eventId ? 'block' : 'none';
  document.getElementById('entry-head-detail').style.display = 'none';
  document.getElementById('entry-donor-section').style.display = 'none';
  document.getElementById('entry-amount-section').style.display = 'none';
  document.getElementById('entry-head-type').value = '';
}

async function onHeadTypeChange() {
  const type = document.getElementById('entry-head-type').value;
  entryState.headType = type;
  entryState.headId = null;
  const detailEl = document.getElementById('entry-head-detail');

  if (!type) { detailEl.style.display = 'none'; return; }
  detailEl.style.display = 'block';

  if (type === 'general') {
    const { data } = await db.from('general_heads').select('*').eq('event_id', entryState.eventId).order('display_order');
    detailEl.innerHTML = `
      <div class="form-group">
        <label>Select General Head</label>
        <select id="entry-general-head" onchange="onGeneralHeadSelect()">
          <option value="">-- Select Head --</option>
          ${(data || []).map(h => `<option value="${h.id}">${h.name}</option>`).join('')}
        </select>
      </div>
    `;
  } else if (type === 'swapna') {
    const { data: swapnas } = await db
      .from('swapna')
      .select('*, swapna_items(*)')
      .eq('event_id', entryState.eventId)
      .order('display_order');

    let opts = '';
    (swapnas || []).forEach(sw => {
      (sw.swapna_items || []).forEach(item => {
        opts += `<option value="${item.id}" data-name="${sw.name} - ${item.name}">${sw.name} → ${item.name}</option>`;
      });
    });

    detailEl.innerHTML = `
      <div class="form-group">
        <label>Select Swapna Item</label>
        <select id="entry-swapna-item" onchange="onSwapnaItemSelect()">
          <option value="">-- Select Item --</option>
          ${opts}
        </select>
      </div>
    `;
  }

  document.getElementById('entry-donor-section').style.display = 'none';
  document.getElementById('entry-amount-section').style.display = 'none';
}

function onGeneralHeadSelect() {
  const sel = document.getElementById('entry-general-head');
  entryState.headId = sel.value;
  entryState.headName = sel.options[sel.selectedIndex].text;
  if (entryState.headId) showDonorSection();
}

function onSwapnaItemSelect() {
  const sel = document.getElementById('entry-swapna-item');
  entryState.headId = sel.value;
  entryState.headName = sel.options[sel.selectedIndex].dataset.name;
  if (entryState.headId) showDonorSection();
}

function showDonorSection() {
  clearDonor();
  document.getElementById('entry-donor-section').style.display = 'block';
  document.getElementById('entry-amount-section').style.display = 'none';
}

let donorSearchTimer = null;
function searchDonor() {
  clearTimeout(donorSearchTimer);
  donorSearchTimer = setTimeout(async () => {
    const q = document.getElementById('donor-search').value.trim();
    const resultsEl = document.getElementById('donor-search-results');

    if (q.length < 1) {
      resultsEl.innerHTML = '';
      document.getElementById('new-donor-section').style.display = 'block';
      return;
    }

    const { data } = await db
      .from('members')
      .select('*')
      .or(`person_name.ilike.%${q}%,family_no.ilike.%${q}%`)
      .limit(10);

    if (!data || data.length === 0) {
      resultsEl.innerHTML = `<p style="font-size:12px;color:var(--text-muted);padding:8px;">No match found.</p>`;
      document.getElementById('new-donor-section').style.display = 'block';
      return;
    }

    document.getElementById('new-donor-section').style.display = 'none';
    resultsEl.innerHTML = `
      <div class="search-results">
        ${data.map(m => `
          <div class="search-result-item" onclick="selectDonor('${m.id}','${m.person_name.replace(/'/g,"\\'")}','${m.family_no}')">
            <div>${m.person_name}</div>
            <div class="family-no">Family No: ${m.family_no}</div>
          </div>
        `).join('')}
      </div>
    `;
  }, 300);
}

function selectDonor(id, name, familyNo) {
  entryState.memberId = id;
  entryState.memberName = name;
  entryState.familyNo = familyNo;

  document.getElementById('donor-search-results').innerHTML = '';
  document.getElementById('donor-search').value = '';
  document.getElementById('new-donor-section').style.display = 'none';

  document.getElementById('selected-donor').style.display = 'block';
  document.getElementById('selected-donor-name').textContent = name;
  document.getElementById('selected-donor-family').textContent = 'Family: ' + familyNo;

  document.getElementById('entry-amount-section').style.display = 'block';
  document.getElementById('entry-amount').focus();
}

function clearDonor() {
  entryState.memberId = null;
  entryState.memberName = null;
  entryState.familyNo = null;
  document.getElementById('selected-donor').style.display = 'none';
  document.getElementById('donor-search').value = '';
  document.getElementById('donor-search-results').innerHTML = '';
  document.getElementById('new-donor-section').style.display = 'none';
  document.getElementById('entry-amount-section').style.display = 'none';
}

async function addNewDonorInline() {
  const familyNo = document.getElementById('new-family-no').value.trim();
  const personName = document.getElementById('new-person-name').value.trim();
  if (!familyNo || !personName) { showToast('Fill family no. and name', 'error'); return; }

  const { data, error } = await db.from('members').insert({ family_no: familyNo, person_name: personName }).select().single();
  if (error) { showToast('Error: ' + error.message, 'error'); return; }

  showToast('New member added!', 'success');
  selectDonor(data.id, data.person_name, data.family_no);
}

let recentEntries = [];
let lastSavedDonationId = null;

async function saveDonation() {
  const amount = parseFloat(document.getElementById('entry-amount').value);
  const note = document.getElementById('entry-note').value.trim();

  if (!entryState.eventId) { showToast('Select event', 'error'); return; }
  if (!entryState.headId) { showToast('Select donation head', 'error'); return; }
  if (!entryState.memberId) { showToast('Select donor', 'error'); return; }
  if (!amount || amount <= 0) { showToast('Enter valid amount', 'error'); return; }

  const record = {
    event_id: entryState.eventId,
    head_type: entryState.headType === 'swapna' ? 'swapna_item' : 'general_head',
    swapna_item_id: entryState.headType === 'swapna' ? entryState.headId : null,
    general_head_id: entryState.headType === 'general' ? entryState.headId : null,
    member_id: entryState.memberId,
    donor_name: entryState.memberName,
    family_no: entryState.familyNo,
    amount,
    note: note || null,
    entered_by: currentUser.id
  };

  const { data: saved, error } = await db.from('donations').insert(record).select().single();
  if (error) { showToast('Error: ' + error.message, 'error'); return; }

  lastSavedDonationId = saved.id;
  showToast(`✅ Saved! ${entryState.memberName} → ${formatAmount(amount)}`, 'success');

  // Show post-save actions
  const postCard = document.getElementById('post-save-card');
  document.getElementById('post-save-summary').textContent =
    `${entryState.memberName} · ${entryState.headName} · ${formatAmount(amount)}`;
  postCard.style.display = 'block';

  // Add to recent entries
  recentEntries.unshift({
    id: saved.id,
    donor: entryState.memberName,
    family: entryState.familyNo,
    head: entryState.headName,
    amount
  });

  updateRecentEntries();

  // Reset amount and note (keep event + head for faster entry)
  document.getElementById('entry-amount').value = '';
  document.getElementById('entry-note').value = '';
  clearDonor();
}

function printLastReceipt() {
  if (lastSavedDonationId) showDonationReceipt(lastSavedDonationId);
}

function whatsappLastDonation() {
  if (!recentEntries.length) return;
  const e = recentEntries[0];
  const msg = `🛕 *Derasar Boli - Donation Receipt*\n\n` +
    `👤 Donor: ${e.donor}\n` +
    `🏠 Family: ${e.family || '—'}\n` +
    `📋 Head: ${e.head}\n` +
    `💰 Amount: ${formatAmount(e.amount)}\n\n` +
    `🙏 Jai Jinendra`;
  window.open('https://wa.me/?text=' + encodeURIComponent(msg), '_blank');
}

function updateRecentEntries() {
  const el = document.getElementById('recent-entries');
  if (recentEntries.length === 0) return;
  el.innerHTML = `
    <div style="overflow-x:auto;">
      <table class="data-table">
        <thead><tr><th>Donor</th><th>Family</th><th>Head</th><th>Amount</th><th>Actions</th></tr></thead>
        <tbody>
          ${recentEntries.slice(0, 10).map(e => `
            <tr>
              <td>${e.donor}</td>
              <td>${e.family}</td>
              <td>${e.head}</td>
              <td><strong>${formatAmount(e.amount)}</strong></td>
              <td>
                <div style="display:flex;gap:4px;">
                  <button class="btn-sm btn-secondary" onclick="showDonationReceipt('${e.id}')">🧾</button>
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

// ========== EDIT / DELETE DONATIONS ==========

async function showEditDonationModal(id, refreshFn) {
  const { data: d, error } = await db.from('donations').select('*').eq('id', id).single();
  if (error || !d) { showToast('Could not load', 'error'); return; }

  showModal(`
    <div class="modal-title">Edit Donation</div>
    <div style="font-size:13px;color:var(--text-muted);margin-bottom:14px;">
      <strong>${d.donor_name}</strong> · Family: ${d.family_no || '—'}
    </div>
    <div class="form-group">
      <label>Amount</label>
      <div class="amount-input-wrap">
        <input type="number" id="edit-don-amount" value="${d.amount}" min="1" />
      </div>
    </div>
    <div class="form-group">
      <label>Note (optional)</label>
      <input type="text" id="edit-don-note" value="${d.note || ''}" placeholder="Any note..." />
    </div>
    <div class="modal-actions">
      <button class="btn-primary" onclick="updateDonation('${id}','${refreshFn}')">Update</button>
      <button class="btn-secondary" onclick="closeModal()">Cancel</button>
    </div>
  `);
}

async function updateDonation(id, refreshFn) {
  const amount = parseFloat(document.getElementById('edit-don-amount').value);
  const note = document.getElementById('edit-don-note').value.trim();
  if (!amount || amount <= 0) { showToast('Enter valid amount', 'error'); return; }

  const { error } = await db.from('donations').update({ amount, note: note || null }).eq('id', id);
  if (error) { showToast('Error: ' + error.message, 'error'); return; }

  closeModal();
  showToast('Donation updated!', 'success');
  if (refreshFn === 'live') loadLiveData();
  else if (refreshFn === 'reports') loadReport();
}

async function deleteDonation(id, refreshFn) {
  if (!confirm('Delete this donation entry? This cannot be undone.')) return;
  const { error } = await db.from('donations').delete().eq('id', id);
  if (error) { showToast('Error: ' + error.message, 'error'); return; }
  showToast('Donation deleted');
  if (refreshFn === 'live') loadLiveData();
  else if (refreshFn === 'reports') loadReport();
  else if (refreshFn === 'entry') {
    recentEntries = recentEntries.filter(e => e.id !== id);
    updateRecentEntries();
  }
}
