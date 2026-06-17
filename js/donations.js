// ==========================================
// DERASAR BOLI - Donation Entry (v2)
// Multi-head, receipt-based flow
// ==========================================

let donSession = {
  eventId: null, eventName: null,
  memberId: null, memberName: null, familyNo: null
};

let cachedGeneralHeads = [];
let cachedSwapnaItems = []; // flat: [{id, label}]
let headRows = [];           // [{rowId, headType, headId, headName, amount}]
let headRowCounter = 0;
let sessionReceipts = [];

// ─── RENDER ───────────────────────────────
async function renderEntry() {
  const content = document.getElementById('page-content');

  const { data: events } = await db
    .from('events').select('*').eq('is_live', true)
    .order('created_at', { ascending: false });

  content.innerHTML = `
    <div class="card">
      <div class="card-title">💰 Donation Entry</div>

      <div class="form-group">
        <label>Step 1: Select Event</label>
        <select id="entry-event" onchange="onEntryEventChange()">
          <option value="">-- Select Live Event --</option>
          ${(events || []).map(ev =>
            `<option value="${ev.id}" data-name="${ev.name}">${ev.name}</option>`
          ).join('')}
        </select>
        ${(!events || events.length === 0)
          ? '<p style="color:var(--danger);font-size:12px;margin-top:4px;">No live events.</p>' : ''}
      </div>

      <div id="step2" style="display:none">
        <div style="font-size:13px;font-weight:700;color:var(--primary);margin:14px 0 10px;padding-top:10px;border-top:2px solid var(--border);">Step 2: Donor</div>
        <div class="search-box">
          <input type="text" id="donor-search" placeholder="Search by name or family no..." oninput="searchDonorEntry()" />
        </div>
        <div id="donor-results"></div>
        <div id="selected-donor-bar" style="display:none;padding:10px;background:#FFF8F0;border-radius:8px;border:1.5px solid var(--accent);margin-bottom:10px;">
          <strong id="sel-donor-name"></strong>
          <span id="sel-donor-family" style="font-size:12px;color:var(--text-muted);margin-left:8px;"></span>
          <button class="btn-sm" style="float:right;background:#eee;color:#333;" onclick="clearDonorEntry()">Change</button>
        </div>
        <div id="new-donor-inline" style="display:none;margin-bottom:10px;">
          <p style="font-size:12px;color:var(--text-muted);margin-bottom:6px;">Not found — add new:</p>
          <div style="display:flex;gap:8px;flex-wrap:wrap;">
            <input type="text" id="nd-family" placeholder="Family No." style="width:110px;padding:8px;border:1.5px solid var(--border);border-radius:6px;font-size:13px;" />
            <input type="text" id="nd-name" placeholder="Person Name" style="flex:1;min-width:140px;padding:8px;border:1.5px solid var(--border);border-radius:6px;font-size:13px;" />
            <button class="btn-accent btn-sm" onclick="addNewDonorEntry()">Add</button>
          </div>
        </div>
        <div id="receipt-name-row" style="display:none;">
          <div class="form-group">
            <label>Receipt Name &nbsp;<span style="font-weight:400;color:var(--text-muted);font-size:10px;">change if receipt needed in family member's name</span></label>
            <input type="text" id="receipt-name-input" placeholder="Leave blank to use donor name" />
          </div>
        </div>
      </div>

      <div id="step3" style="display:none">
        <div style="font-size:13px;font-weight:700;color:var(--primary);margin:14px 0 10px;padding-top:10px;border-top:2px solid var(--border);">Step 3: Donation Heads</div>
        <div id="head-rows"></div>
        <button class="btn-secondary btn-sm" onclick="addHeadRow()" style="margin-top:6px;">+ Add Head</button>
        <div id="entry-total" style="display:none;margin-top:12px;padding:10px;background:#FFF8F0;border-radius:8px;border:1.5px solid var(--accent);text-align:right;">
          Total: <strong id="total-amt" style="font-size:18px;color:var(--primary);">₹0</strong>
        </div>
      </div>

      <div id="step4" style="display:none">
        <div style="font-size:13px;font-weight:700;color:var(--primary);margin:14px 0 10px;padding-top:10px;border-top:2px solid var(--border);">Step 4: Payment</div>
        <div class="form-group">
          <label>Mode of Payment</label>
          <select id="pay-mode" onchange="onPayModeChange()">
            <option value="cash">💵 Cash</option>
            <option value="cheque">🏦 Cheque</option>
            <option value="online">📱 Online / UPI</option>
            <option value="pending">⏳ Pending — will pay later</option>
          </select>
        </div>
        <div id="bank-fields" style="display:none;">
          <div style="display:flex;gap:8px;flex-wrap:wrap;">
            <div class="form-group" style="flex:1;min-width:130px;">
              <label>Bank Name</label>
              <input type="text" id="bank-name" placeholder="e.g. SBI, HDFC" />
            </div>
            <div class="form-group" style="flex:1;min-width:130px;">
              <label id="utr-label">UTR / Cheque No.</label>
              <input type="text" id="utr-no" placeholder="Number" />
            </div>
          </div>
        </div>
        <div class="form-group">
          <label>Notes (optional)</label>
          <input type="text" id="entry-notes" placeholder="Any notes..." />
        </div>
        <div style="display:flex;flex-direction:column;gap:8px;margin-top:14px;">
          <button class="btn-primary" onclick="saveDonation('receipt')">✅ Save &amp; Generate Receipt</button>
          <button style="background:#25D366;color:white;border:none;padding:11px 20px;border-radius:8px;font-size:14px;font-weight:600;cursor:pointer;" onclick="saveDonation('send')">📲 Save &amp; Send on WhatsApp</button>
          <button class="btn-secondary" onclick="saveDonation('pending')">💾 Save — Collect Payment Later</button>
        </div>
      </div>
    </div>

    <div class="card">
      <div class="card-title">Recent Entries (This Session)</div>
      <div id="recent-entries"><p style="color:var(--text-muted);font-size:13px;">No entries yet.</p></div>
    </div>
  `;

  donSession = { eventId: null, eventName: null, memberId: null, memberName: null, familyNo: null };
  headRows = []; headRowCounter = 0;
  cachedGeneralHeads = []; cachedSwapnaItems = [];
}

// ─── EVENT ────────────────────────────────
async function onEntryEventChange() {
  const sel = document.getElementById('entry-event');
  donSession.eventId = sel.value;
  donSession.eventName = sel.options[sel.selectedIndex]?.dataset?.name || '';
  if (!donSession.eventId) return;

  const [{ data: gh }, { data: sw }] = await Promise.all([
    db.from('general_heads').select('*').eq('event_id', donSession.eventId).order('display_order'),
    db.from('swapna').select('*, swapna_items(*)').eq('event_id', donSession.eventId).order('display_order')
  ]);

  cachedGeneralHeads = gh || [];
  cachedSwapnaItems = [];
  (sw || []).forEach(s => {
    (s.swapna_items || []).forEach(item => {
      cachedSwapnaItems.push({ id: item.id, label: `${s.name} → ${item.name}` });
    });
  });

  clearDonorEntry();
  headRows = []; headRowCounter = 0;
  renderHeadRows();
  document.getElementById('step2').style.display = 'block';
  document.getElementById('step3').style.display = 'none';
  document.getElementById('step4').style.display = 'none';
}

// ─── DONOR SEARCH ─────────────────────────
let donorSearchTimer = null;
function searchDonorEntry() {
  clearTimeout(donorSearchTimer);
  donorSearchTimer = setTimeout(async () => {
    const q = document.getElementById('donor-search').value.trim();
    const res = document.getElementById('donor-results');
    if (q.length < 1) {
      res.innerHTML = '';
      document.getElementById('new-donor-inline').style.display = 'block';
      return;
    }
    const { data } = await db.from('members').select('*')
      .or(`person_name.ilike.%${q}%,family_no.ilike.%${q}%`).limit(10);
    if (!data || data.length === 0) {
      res.innerHTML = `<p style="font-size:12px;color:var(--text-muted);padding:6px;">No match found.</p>`;
      document.getElementById('new-donor-inline').style.display = 'block';
      return;
    }
    document.getElementById('new-donor-inline').style.display = 'none';
    res.innerHTML = `<div class="search-results">${data.map(m =>
      `<div class="search-result-item" onclick="selectDonorEntry('${m.id}','${m.person_name.replace(/'/g,"\\'")}','${(m.family_no||'').replace(/'/g,"\\'")}')">
        <div>${m.person_name}</div>
        <div class="family-no">Family No: ${m.family_no || '—'}</div>
      </div>`
    ).join('')}</div>`;
  }, 300);
}

function selectDonorEntry(id, name, familyNo) {
  donSession.memberId = id;
  donSession.memberName = name;
  donSession.familyNo = familyNo;
  document.getElementById('donor-results').innerHTML = '';
  document.getElementById('donor-search').value = '';
  document.getElementById('new-donor-inline').style.display = 'none';
  document.getElementById('selected-donor-bar').style.display = 'block';
  document.getElementById('sel-donor-name').textContent = name;
  document.getElementById('sel-donor-family').textContent = familyNo ? 'Family: ' + familyNo : '';
  document.getElementById('receipt-name-row').style.display = 'block';
  document.getElementById('receipt-name-input').value = '';
  document.getElementById('step3').style.display = 'block';
  document.getElementById('step4').style.display = 'block';
  if (headRows.length === 0) addHeadRow();
}

function clearDonorEntry() {
  donSession.memberId = null; donSession.memberName = null; donSession.familyNo = null;
  const ds = document.getElementById('donor-search'); if (ds) ds.value = '';
  const dr = document.getElementById('donor-results'); if (dr) dr.innerHTML = '';
  const ni = document.getElementById('new-donor-inline'); if (ni) ni.style.display = 'none';
  const sb = document.getElementById('selected-donor-bar'); if (sb) sb.style.display = 'none';
  const rr = document.getElementById('receipt-name-row'); if (rr) rr.style.display = 'none';
  const s3 = document.getElementById('step3'); if (s3) s3.style.display = 'none';
  const s4 = document.getElementById('step4'); if (s4) s4.style.display = 'none';
}

async function addNewDonorEntry() {
  const familyNo = document.getElementById('nd-family').value.trim();
  const personName = document.getElementById('nd-name').value.trim();
  if (!familyNo || !personName) { showToast('Fill family no. and name', 'error'); return; }
  const { data, error } = await db.from('members').insert({ family_no: familyNo, person_name: personName }).select().single();
  if (error) { showToast('Error: ' + error.message, 'error'); return; }
  showToast('Member added!', 'success');
  selectDonorEntry(data.id, data.person_name, data.family_no);
}

// ─── HEAD ROWS ────────────────────────────
function addHeadRow() {
  headRowCounter++;
  headRows.push({ rowId: headRowCounter, headType: '', headId: '', headName: '', amount: '' });
  renderHeadRows();
}

function removeHeadRow(rowId) {
  headRows = headRows.filter(r => r.rowId !== rowId);
  renderHeadRows();
  updateEntryTotal();
}

function renderHeadRows() {
  const container = document.getElementById('head-rows');
  if (!container) return;
  if (headRows.length === 0) {
    container.innerHTML = '<p style="font-size:12px;color:var(--text-muted);padding:6px 0;">No heads added yet.</p>';
    const et = document.getElementById('entry-total'); if (et) et.style.display = 'none';
    return;
  }

  container.innerHTML = headRows.map((row, idx) => {
    const ghOpts = cachedGeneralHeads.map(h =>
      `<option value="${h.id}" data-name="${h.name}" ${row.headType==='general'&&row.headId===h.id?'selected':''}>${h.name}</option>`
    ).join('');
    const swOpts = cachedSwapnaItems.map(s =>
      `<option value="${s.id}" data-name="${s.label}" ${row.headType==='swapna'&&row.headId===s.id?'selected':''}>${s.label}</option>`
    ).join('');

    return `<div style="display:flex;align-items:center;gap:6px;padding:8px 0;border-bottom:1px solid var(--border);flex-wrap:wrap;">
      <span style="font-size:12px;color:var(--text-muted);min-width:18px;">${idx+1}.</span>
      <select onchange="onHeadTypeDyn(${row.rowId},this.value)" style="flex:1;min-width:110px;padding:8px;border:1.5px solid var(--border);border-radius:6px;font-size:13px;">
        <option value="" ${!row.headType?'selected':''}>-- Type --</option>
        <option value="general" ${row.headType==='general'?'selected':''}>🔷 General</option>
        <option value="swapna"  ${row.headType==='swapna'?'selected':''}>🔶 Swapna</option>
      </select>
      ${row.headType==='general'?`<select onchange="onHeadSelectDyn(${row.rowId},this.value,this.options[this.selectedIndex].dataset.name)" style="flex:2;min-width:150px;padding:8px;border:1.5px solid var(--border);border-radius:6px;font-size:13px;"><option value="">-- Select Head --</option>${ghOpts}</select>`:''}
      ${row.headType==='swapna'?`<select onchange="onHeadSelectDyn(${row.rowId},this.value,this.options[this.selectedIndex].dataset.name)" style="flex:2;min-width:150px;padding:8px;border:1.5px solid var(--border);border-radius:6px;font-size:13px;"><option value="">-- Select Item --</option>${swOpts}</select>`:''}
      ${!row.headType?'<div style="flex:2;"></div>':''}
      <input type="number" value="${row.amount}" placeholder="₹" min="1"
        oninput="onAmountDyn(${row.rowId},this.value)"
        style="width:90px;padding:8px;border:1.5px solid var(--border);border-radius:6px;font-size:14px;font-weight:700;" />
      <button onclick="removeHeadRow(${row.rowId})" class="btn-sm btn-danger" style="padding:5px 9px;">✕</button>
    </div>`;
  }).join('');

  const et = document.getElementById('entry-total');
  if (et) et.style.display = 'block';
  updateEntryTotal();
}

function onHeadTypeDyn(rowId, type) {
  const row = headRows.find(r => r.rowId === rowId);
  if (!row) return;
  row.headType = type; row.headId = ''; row.headName = '';
  renderHeadRows();
}

function onHeadSelectDyn(rowId, headId, headName) {
  const row = headRows.find(r => r.rowId === rowId);
  if (row) { row.headId = headId; row.headName = headName || ''; }
}

function onAmountDyn(rowId, val) {
  const row = headRows.find(r => r.rowId === rowId);
  if (row) row.amount = val;
  updateEntryTotal();
}

function updateEntryTotal() {
  const total = headRows.reduce((s, r) => s + (parseFloat(r.amount) || 0), 0);
  const el = document.getElementById('total-amt');
  if (el) el.textContent = formatAmount(total);
}

// ─── PAYMENT MODE ─────────────────────────
function onPayModeChange() {
  const mode = document.getElementById('pay-mode').value;
  document.getElementById('bank-fields').style.display = (mode==='cheque'||mode==='online') ? 'block' : 'none';
  const lbl = document.getElementById('utr-label');
  if (lbl) lbl.textContent = mode==='cheque' ? 'Cheque No.' : 'UTR No.';
}

// ─── AUTO RECEIPT NO ──────────────────────
async function generateReceiptNo() {
  const year = new Date().getFullYear();
  const { data } = await db.from('receipts')
    .select('receipt_no').not('receipt_no','is',null)
    .ilike('receipt_no', `${year}/%`)
    .order('created_at', { ascending: false }).limit(1);
  let next = 1;
  if (data && data.length > 0 && data[0].receipt_no) {
    next = (parseInt(data[0].receipt_no.split('/')[1]) || 0) + 1;
  }
  return `${year}/${String(next).padStart(3,'0')}`;
}

// ─── SAVE ─────────────────────────────────
async function saveDonation(action) {
  if (!donSession.eventId)   { showToast('Select event', 'error'); return; }
  if (!donSession.memberId)  { showToast('Select donor', 'error'); return; }
  if (headRows.length === 0) { showToast('Add at least one head', 'error'); return; }
  for (const row of headRows) {
    if (!row.headId)                       { showToast('Select head for every row', 'error'); return; }
    if (!row.amount || parseFloat(row.amount) <= 0) { showToast('Enter amount for every row', 'error'); return; }
  }

  const payMode      = document.getElementById('pay-mode').value;
  const bankName     = document.getElementById('bank-name')?.value.trim() || '';
  const utrNo        = document.getElementById('utr-no')?.value.trim() || '';
  const notes        = document.getElementById('entry-notes')?.value.trim() || '';
  const rNameInput   = document.getElementById('receipt-name-input')?.value.trim() || '';
  const receiptName  = rNameInput || donSession.memberName;
  const isPaid       = action !== 'pending';
  const total        = headRows.reduce((s,r) => s + (parseFloat(r.amount)||0), 0);
  const receiptNo    = await generateReceiptNo();

  const { data: receipt, error: rErr } = await db.from('receipts').insert({
    event_id:     donSession.eventId,
    member_id:    donSession.memberId,
    receipt_name: receiptName,
    family_no:    donSession.familyNo,
    receipt_no:   receiptNo,
    payment_mode: isPaid ? payMode : 'pending',
    bank_name:    bankName || null,
    utr_no:       utrNo || null,
    total_amount: total,
    is_paid:      isPaid,
    notes:        notes || null,
    entered_by:   currentUser.id
  }).select().single();
  if (rErr) { showToast('Error: ' + rErr.message, 'error'); return; }

  const donRecords = headRows.map(row => ({
    event_id:        donSession.eventId,
    receipt_id:      receipt.id,
    head_type:       row.headType === 'swapna' ? 'swapna_item' : 'general_head',
    swapna_item_id:  row.headType === 'swapna'  ? row.headId : null,
    general_head_id: row.headType === 'general' ? row.headId : null,
    member_id:       donSession.memberId,
    donor_name:      receiptName,
    family_no:       donSession.familyNo,
    amount:          parseFloat(row.amount),
    note:            notes || null,
    entered_by:      currentUser.id
  }));
  const { error: dErr } = await db.from('donations').insert(donRecords);
  if (dErr) { showToast('Error: ' + dErr.message, 'error'); return; }

  showToast(`✅ ${isPaid ? 'Receipt ' + receiptNo : 'Saved as Pending — ' + receiptName}`, 'success');

  sessionReceipts.unshift({
    id: receipt.id, receiptNo, receiptName,
    familyNo: donSession.familyNo, total, isPaid, payMode,
    heads: headRows.map(r => ({ name: r.headName, amount: parseFloat(r.amount) }))
  });
  renderSessionReceipts();

  if (action === 'receipt' || action === 'send') {
    await showReceiptById(receipt.id, action === 'send');
  }

  clearDonorEntry();
  headRows = []; headRowCounter = 0;
  renderHeadRows();
}

// ─── SESSION LIST ─────────────────────────
function renderSessionReceipts() {
  const el = document.getElementById('recent-entries');
  if (!el || sessionReceipts.length === 0) return;
  el.innerHTML = `<div style="overflow-x:auto;"><table class="data-table">
    <thead><tr><th>Receipt No.</th><th>Name</th><th>Heads</th><th>Total</th><th>Status</th><th>Actions</th></tr></thead>
    <tbody>${sessionReceipts.map(r => `
      <tr>
        <td><strong>${r.receiptNo}</strong></td>
        <td>${r.receiptName}<br><span style="font-size:11px;color:var(--text-muted);">Family: ${r.familyNo||'—'}</span></td>
        <td style="font-size:12px;">${r.heads.map(h=>`${h.name}: ${formatAmount(h.amount)}`).join('<br>')}</td>
        <td><strong>${formatAmount(r.total)}</strong></td>
        <td>${r.isPaid
          ? '<span class="badge badge-live">Paid</span>'
          : '<span class="badge badge-draft">Pending</span>'}</td>
        <td>
          <div style="display:flex;gap:4px;flex-wrap:wrap;">
            <button class="btn-sm btn-secondary" onclick="showReceiptById('${r.id}',false)">🧾 Receipt</button>
            <button class="btn-sm" style="background:#25D366;color:white;" onclick="showReceiptById('${r.id}',true)">📲 Send</button>
            ${!r.isPaid ? `<button class="btn-sm btn-primary" onclick="collectPaymentModal('${r.id}','${r.receiptNo}',${r.total})">💰 Collect</button>` : ''}
          </div>
        </td>
      </tr>`).join('')}
    </tbody>
  </table></div>`;
}

// ─── COLLECT PAYMENT ──────────────────────
function collectPaymentModal(receiptId, receiptNo, total) {
  showModal(`
    <div class="modal-title">💰 Collect Payment</div>
    <div style="font-size:13px;color:var(--text-muted);margin-bottom:14px;">Receipt ${receiptNo} &nbsp;·&nbsp; ${formatAmount(total)}</div>
    <div class="form-group">
      <label>Mode of Payment</label>
      <select id="cp-mode" onchange="onCPModeChange()">
        <option value="cash">💵 Cash</option>
        <option value="cheque">🏦 Cheque</option>
        <option value="online">📱 Online / UPI</option>
      </select>
    </div>
    <div id="cp-bank-fields" style="display:none;">
      <div style="display:flex;gap:8px;flex-wrap:wrap;">
        <div class="form-group" style="flex:1;min-width:120px;">
          <label>Bank Name</label>
          <input type="text" id="cp-bank" placeholder="e.g. SBI" />
        </div>
        <div class="form-group" style="flex:1;min-width:120px;">
          <label id="cp-utr-label">UTR / Cheque No.</label>
          <input type="text" id="cp-utr" placeholder="Number" />
        </div>
      </div>
    </div>
    <div class="modal-actions">
      <button class="btn-primary" onclick="confirmCollectPayment('${receiptId}','receipt')">✅ Confirm &amp; Receipt</button>
      <button style="background:#25D366;color:white;border:none;padding:9px 16px;border-radius:8px;font-size:13px;font-weight:600;cursor:pointer;" onclick="confirmCollectPayment('${receiptId}','send')">📲 Confirm &amp; Send</button>
      <button class="btn-secondary" onclick="closeModal()">Cancel</button>
    </div>
  `);
}

function onCPModeChange() {
  const mode = document.getElementById('cp-mode').value;
  document.getElementById('cp-bank-fields').style.display = (mode==='cheque'||mode==='online') ? 'block' : 'none';
  const lbl = document.getElementById('cp-utr-label');
  if (lbl) lbl.textContent = mode==='cheque' ? 'Cheque No.' : 'UTR No.';
}

async function confirmCollectPayment(receiptId, action) {
  const mode     = document.getElementById('cp-mode').value;
  const bankName = document.getElementById('cp-bank')?.value.trim() || '';
  const utrNo    = document.getElementById('cp-utr')?.value.trim() || '';
  const { error } = await db.from('receipts').update({
    is_paid: true, payment_mode: mode,
    bank_name: bankName || null, utr_no: utrNo || null
  }).eq('id', receiptId);
  if (error) { showToast('Error: ' + error.message, 'error'); return; }
  closeModal();
  showToast('✅ Payment recorded!', 'success');
  const sr = sessionReceipts.find(r => r.id === receiptId);
  if (sr) { sr.isPaid = true; sr.payMode = mode; }
  renderSessionReceipts();
  if (action === 'receipt' || action === 'send') await showReceiptById(receiptId, action === 'send');
}

// ─── EDIT / DELETE (used in Live View & Reports) ──
async function showEditDonationModal(id, refreshFn) {
  const { data: d, error } = await db.from('donations').select('*').eq('id', id).single();
  if (error || !d) { showToast('Could not load', 'error'); return; }
  showModal(`
    <div class="modal-title">Edit Donation</div>
    <div style="font-size:13px;color:var(--text-muted);margin-bottom:14px;"><strong>${d.donor_name}</strong> · Family: ${d.family_no||'—'}</div>
    <div class="form-group">
      <label>Amount</label>
      <div class="amount-input-wrap"><input type="number" id="edit-don-amount" value="${d.amount}" min="1" /></div>
    </div>
    <div class="form-group">
      <label>Note (optional)</label>
      <input type="text" id="edit-don-note" value="${d.note||''}" placeholder="Any note..." />
    </div>
    <div class="modal-actions">
      <button class="btn-primary" onclick="updateDonation('${id}','${refreshFn}')">Update</button>
      <button class="btn-secondary" onclick="closeModal()">Cancel</button>
    </div>
  `);
}

async function updateDonation(id, refreshFn) {
  const amount = parseFloat(document.getElementById('edit-don-amount').value);
  const note   = document.getElementById('edit-don-note').value.trim();
  if (!amount || amount <= 0) { showToast('Enter valid amount', 'error'); return; }
  const { error } = await db.from('donations').update({ amount, note: note||null }).eq('id', id);
  if (error) { showToast('Error: ' + error.message, 'error'); return; }
  closeModal(); showToast('Updated!', 'success');
  if (refreshFn === 'live') loadLiveData();
  else if (refreshFn === 'reports') loadReport();
}

async function deleteDonation(id, refreshFn) {
  if (!confirm('Delete this donation entry?')) return;
  const { error } = await db.from('donations').delete().eq('id', id);
  if (error) { showToast('Error: ' + error.message, 'error'); return; }
  showToast('Deleted');
  if (refreshFn === 'live') loadLiveData();
  else if (refreshFn === 'reports') loadReport();
}
