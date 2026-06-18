// ==========================================
// DERASAR BOLI - Reports Page
// ==========================================

let currentReportEventId = null;
let currentReportDonations = [];

async function renderReports() {
  const content = document.getElementById('page-content');

  const { data: events } = await db
    .from('events')
    .select('*')
    .order('created_at', { ascending: false });

  content.innerHTML = `
    <div class="card">
      <div class="card-title">📊 Reports</div>
      <div class="form-group">
        <label>Select Event</label>
        <select id="report-event-select" onchange="loadReport()">
          <option value="">-- Select Event --</option>
          ${(events || []).map(ev => `<option value="${ev.id}">${ev.name}</option>`).join('')}
        </select>
      </div>
    </div>
    <div id="report-content"></div>
  `;

  if (events && events.length === 1) {
    document.getElementById('report-event-select').value = events[0].id;
    loadReport();
  }
}

async function loadReport() {
  const eventId = document.getElementById('report-event-select').value;
  if (!eventId) return;
  currentReportEventId = eventId;

  const el = document.getElementById('report-content');
  el.innerHTML = '<p style="color:var(--text-muted);padding:16px;">Loading...</p>';

  const [
    { data: receipts },
    { data: donations },
    { data: swapnas },
    { data: generalHeads },
    { data: eventData }
  ] = await Promise.all([
    db.from('receipts').select('*').eq('event_id', eventId).order('created_at'),
    db.from('donations').select('*').eq('event_id', eventId).order('created_at'),
    db.from('swapna').select('*, swapna_items(*)').eq('event_id', eventId).order('display_order'),
    db.from('general_heads').select('*').is('event_id', null).order('display_order'),
    db.from('events').select('*').eq('id', eventId).single()
  ]);

  currentReportDonations = donations || [];

  if (!donations || donations.length === 0) {
    el.innerHTML = `<div class="card"><div class="empty-state"><div class="empty-icon">📊</div><p>No donations recorded for this event.</p></div></div>`;
    return;
  }

  // ── Lookup maps ──────────────────────────────────────────────────────────────
  const receiptMap = {};
  (receipts || []).forEach(r => { receiptMap[r.id] = r; });

  const swapnaItemNames = {}, swapnaGroupNames = {}, generalHeadNames = {};
  (swapnas || []).forEach(sw => {
    (sw.swapna_items || []).forEach(item => {
      swapnaItemNames[item.id] = item.name;
      swapnaGroupNames[item.id] = sw.name;
    });
  });
  (generalHeads || []).forEach(h => { generalHeadNames[h.id] = h.name; });

  // ── Aggregate ────────────────────────────────────────────────────────────────
  let grandTotal = 0, paidTotal = 0, pendingTotal = 0;
  const headTotals = {}; // id → { name, paid, pending }

  const addHead = (id, name, amount, isPaid) => {
    if (!headTotals[id]) headTotals[id] = { name, paid: 0, pending: 0 };
    if (isPaid) headTotals[id].paid += amount;
    else        headTotals[id].pending += amount;
  };

  (donations || []).forEach(d => {
    const amount  = parseFloat(d.amount);
    const receipt = receiptMap[d.receipt_id];
    const isPaid  = receipt ? receipt.is_paid : true;

    grandTotal += amount;
    if (isPaid) paidTotal += amount; else pendingTotal += amount;

    if (d.head_type === 'general_head' && d.general_head_id)
      addHead(d.general_head_id, generalHeadNames[d.general_head_id] || 'General', amount, isPaid);
    else if (d.head_type === 'swapna_item' && d.swapna_item_id)
      addHead(d.swapna_item_id,
        (swapnaGroupNames[d.swapna_item_id] || 'Swapna') + ' → ' + (swapnaItemNames[d.swapna_item_id] || ''),
        amount, isPaid);
  });

  const pendingReceipts = (receipts || []).filter(r => !r.is_paid);

  // Donor summary — one row per receipt, sorted by family_no
  const donorRows = (receipts || [])
    .slice()
    .sort((a, b) => (a.family_no || '').localeCompare(b.family_no || '', undefined, { numeric: true }));

  const adminActions = isAdmin();

  // ── Render ───────────────────────────────────────────────────────────────────
  el.innerHTML = `

    <!-- 1. Summary Banner -->
    <div class="card" style="background:var(--primary);color:white;">
      <div style="font-size:14px;opacity:.8;margin-bottom:10px;">${eventData.name}</div>
      <div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:14px;">
        <div style="flex:1;min-width:110px;">
          <div style="font-size:11px;opacity:.7;">Grand Total</div>
          <div style="font-size:30px;font-weight:800;">${formatAmount(grandTotal)}</div>
          <div style="font-size:11px;opacity:.6;">${(receipts||[]).length} receipts · ${donations.length} entries</div>
        </div>
        <div style="flex:1;min-width:110px;background:rgba(255,255,255,.13);border-radius:8px;padding:10px;">
          <div style="font-size:11px;opacity:.75;">✅ Collected</div>
          <div style="font-size:22px;font-weight:700;">${formatAmount(paidTotal)}</div>
        </div>
        <div style="flex:1;min-width:110px;background:rgba(255,152,0,.35);border-radius:8px;padding:10px;">
          <div style="font-size:11px;opacity:.75;">⏳ Pending</div>
          <div style="font-size:22px;font-weight:700;">${formatAmount(pendingTotal)}</div>
          <div style="font-size:11px;opacity:.65;">${pendingReceipts.length} receipt(s)</div>
        </div>
      </div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;">
        <button onclick="printReport()"      style="background:rgba(255,255,255,.2);border:1px solid rgba(255,255,255,.4);color:white;padding:7px 14px;border-radius:6px;font-size:12px;cursor:pointer;">🖨 Print</button>
        <button onclick="exportReportCSV()"  style="background:rgba(255,255,255,.2);border:1px solid rgba(255,255,255,.4);color:white;padding:7px 14px;border-radius:6px;font-size:12px;cursor:pointer;">📥 CSV</button>
        <button onclick="exportReportExcel()" style="background:rgba(255,255,255,.2);border:1px solid rgba(255,255,255,.4);color:white;padding:7px 14px;border-radius:6px;font-size:12px;cursor:pointer;">📊 Excel</button>
      </div>
    </div>

    <!-- 2. Head-wise Collection -->
    <div class="card">
      <div class="card-title">🔷 Head-wise Collection</div>
      <div style="overflow-x:auto;">
        <table class="data-table">
          <thead>
            <tr>
              <th>Donation Head</th>
              <th style="text-align:right;color:#4CAF50;">✅ Collected</th>
              <th style="text-align:right;color:#ff9800;">⏳ Pending</th>
              <th style="text-align:right;">Total</th>
            </tr>
          </thead>
          <tbody>
            ${Object.values(headTotals)
              .sort((a, b) => (b.paid + b.pending) - (a.paid + a.pending))
              .map(h => `
                <tr>
                  <td>${h.name}</td>
                  <td style="text-align:right;color:#4CAF50;font-weight:600;">${formatAmount(h.paid)}</td>
                  <td style="text-align:right;color:${h.pending > 0 ? '#ff9800' : 'var(--text-muted)'};font-weight:600;">${formatAmount(h.pending)}</td>
                  <td style="text-align:right;font-weight:700;color:var(--primary);">${formatAmount(h.paid + h.pending)}</td>
                </tr>`).join('')}
          </tbody>
          <tfoot>
            <tr style="background:var(--primary);color:white;font-weight:700;">
              <td>Total</td>
              <td style="text-align:right;">${formatAmount(paidTotal)}</td>
              <td style="text-align:right;">${formatAmount(pendingTotal)}</td>
              <td style="text-align:right;">${formatAmount(grandTotal)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>

    <!-- 3. Pending Members -->
    <div class="card" style="border-left:4px solid ${pendingReceipts.length ? '#ff9800' : '#4CAF50'};">
      <div class="card-title">${pendingReceipts.length ? `⏳ Pending Payments (${pendingReceipts.length})` : '✅ No Pending Payments'}</div>
      ${pendingReceipts.length ? `
      <div style="overflow-x:auto;">
        <table class="data-table">
          <thead>
            <tr><th>Name</th><th>Family</th><th>Receipt No.</th><th style="text-align:right;">Amount</th><th>Date</th><th>Actions</th></tr>
          </thead>
          <tbody>
            ${pendingReceipts.map(r => `
              <tr>
                <td><strong>${r.receipt_name}</strong></td>
                <td>${r.family_no || '—'}</td>
                <td style="font-size:12px;color:var(--text-muted);">${r.receipt_no}</td>
                <td style="text-align:right;font-weight:700;color:#ff9800;">${formatAmount(r.total_amount)}</td>
                <td style="font-size:11px;color:var(--text-muted);">${new Date(r.created_at).toLocaleDateString('en-IN',{day:'2-digit',month:'2-digit',year:'numeric'})}</td>
                <td>
                  <div style="display:flex;gap:4px;flex-wrap:wrap;">
                    <button class="btn-sm btn-secondary" onclick="showReceiptById('${r.id}',false)">🧾 View</button>
                    <button class="btn-sm btn-primary"   onclick="collectPaymentModal('${r.id}','${r.receipt_no}',${r.total_amount})">💰 Collect</button>
                  </div>
                </td>
              </tr>`).join('')}
          </tbody>
          <tfoot>
            <tr style="background:#fff3e0;font-weight:700;">
              <td colspan="3">Total Pending</td>
              <td style="text-align:right;color:#ff9800;">${formatAmount(pendingTotal)}</td>
              <td colspan="2"></td>
            </tr>
          </tfoot>
        </table>
      </div>` : '<p style="color:#4CAF50;font-size:13px;">All payments collected.</p>'}
    </div>

    <!-- 4. All Donors -->
    <div class="card">
      <div class="card-title">👥 All Donors — Paid & Pending</div>
      <div style="overflow-x:auto;">
        <table class="data-table">
          <thead>
            <tr>
              <th>#</th>
              <th>Name</th>
              <th>Family No.</th>
              <th>Receipt No.</th>
              <th style="text-align:right;color:#4CAF50;">✅ Paid</th>
              <th style="text-align:right;color:#ff9800;">⏳ Pending</th>
              <th style="text-align:right;">Total</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            ${donorRows.map((r, i) => `
              <tr style="${!r.is_paid ? 'background:#fff8ee;' : ''}">
                <td>${i + 1}</td>
                <td><strong>${r.receipt_name}</strong></td>
                <td>${r.family_no || '—'}</td>
                <td style="font-size:11px;color:var(--text-muted);">${r.receipt_no}</td>
                <td style="text-align:right;color:#4CAF50;font-weight:600;">${r.is_paid ? formatAmount(r.total_amount) : '—'}</td>
                <td style="text-align:right;color:#ff9800;font-weight:600;">${!r.is_paid ? formatAmount(r.total_amount) : '—'}</td>
                <td style="text-align:right;font-weight:700;color:var(--primary);">${formatAmount(r.total_amount)}</td>
                <td>
                  <div style="display:flex;gap:4px;flex-wrap:wrap;">
                    <button class="btn-sm btn-secondary" onclick="showReceiptById('${r.id}',false)">🧾</button>
                    ${!r.is_paid && adminActions ? `<button class="btn-sm btn-primary" onclick="collectPaymentModal('${r.id}','${r.receipt_no}',${r.total_amount})">💰</button>` : ''}
                  </div>
                </td>
              </tr>`).join('')}
          </tbody>
          <tfoot>
            <tr style="background:var(--primary);color:white;font-weight:700;">
              <td colspan="4">${donorRows.length} receipts</td>
              <td style="text-align:right;">${formatAmount(paidTotal)}</td>
              <td style="text-align:right;">${formatAmount(pendingTotal)}</td>
              <td style="text-align:right;">${formatAmount(grandTotal)}</td>
              <td></td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  `;
}

function printReport() { window.print(); }

// ========== CSV EXPORT ==========
async function exportReportCSV() {
  if (!currentReportEventId || currentReportDonations.length === 0) {
    showToast('No data to export', 'error'); return;
  }

  const [{ data: eventData }, { data: swapnas }, { data: generalHeads }, { data: receipts }] = await Promise.all([
    db.from('events').select('name').eq('id', currentReportEventId).single(),
    db.from('swapna').select('*, swapna_items(*)').eq('event_id', currentReportEventId),
    db.from('general_heads').select('*').is('event_id', null),
    db.from('receipts').select('*').eq('event_id', currentReportEventId)
  ]);

  const swapnaItemNames = {}, swapnaGroupNames = {}, generalHeadNames = {}, receiptMap = {};
  (swapnas || []).forEach(sw => (sw.swapna_items || []).forEach(item => {
    swapnaItemNames[item.id] = item.name; swapnaGroupNames[item.id] = sw.name;
  }));
  (generalHeads || []).forEach(h => { generalHeadNames[h.id] = h.name; });
  (receipts || []).forEach(r => { receiptMap[r.id] = r; });

  const headers = ['#', 'Donor Name', 'Family No', 'Receipt No', 'Head', 'Amount', 'Status', 'Date'];
  const rows = currentReportDonations.map((d, i) => {
    const isSwapna = d.head_type === 'swapna_item';
    const receipt  = receiptMap[d.receipt_id];
    return [
      i + 1, d.donor_name, d.family_no || '',
      receipt?.receipt_no || '',
      isSwapna
        ? (swapnaGroupNames[d.swapna_item_id] || '') + ' → ' + (swapnaItemNames[d.swapna_item_id] || '')
        : (generalHeadNames[d.general_head_id] || ''),
      d.amount,
      receipt ? (receipt.is_paid ? 'Paid' : 'Pending') : 'Paid',
      new Date(d.created_at).toLocaleDateString('en-IN')
    ];
  });

  const csv = '﻿' + [headers, ...rows]
    .map(row => row.map(c => `"${String(c).replace(/"/g, '""')}"`).join(','))
    .join('\n');

  downloadFile(csv, `${eventData?.name || 'report'}-donations.csv`, 'text/csv;charset=utf-8;');
  showToast('CSV downloaded!', 'success');
}

// ========== EXCEL EXPORT ==========
async function exportReportExcel() {
  if (!currentReportEventId || currentReportDonations.length === 0) {
    showToast('No data to export', 'error'); return;
  }

  if (typeof XLSX === 'undefined') {
    showToast('Loading Excel library...', '');
    await loadScript('https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js');
  }

  const [{ data: eventData }, { data: swapnas }, { data: generalHeads }, { data: receipts }] = await Promise.all([
    db.from('events').select('name').eq('id', currentReportEventId).single(),
    db.from('swapna').select('*, swapna_items(*)').eq('event_id', currentReportEventId),
    db.from('general_heads').select('*').is('event_id', null),
    db.from('receipts').select('*').eq('event_id', currentReportEventId)
  ]);

  const swapnaItemNames = {}, swapnaGroupNames = {}, generalHeadNames = {}, receiptMap = {};
  (swapnas || []).forEach(sw => (sw.swapna_items || []).forEach(item => {
    swapnaItemNames[item.id] = item.name; swapnaGroupNames[item.id] = sw.name;
  }));
  (generalHeads || []).forEach(h => { generalHeadNames[h.id] = h.name; });
  (receipts || []).forEach(r => { receiptMap[r.id] = r; });

  const wsData = [['#', 'Donor Name', 'Family No', 'Receipt No', 'Head', 'Amount (₹)', 'Status', 'Date']];
  currentReportDonations.forEach((d, i) => {
    const isSwapna = d.head_type === 'swapna_item';
    const receipt  = receiptMap[d.receipt_id];
    wsData.push([
      i + 1, d.donor_name, d.family_no || '',
      receipt?.receipt_no || '',
      isSwapna
        ? (swapnaGroupNames[d.swapna_item_id] || '') + ' → ' + (swapnaItemNames[d.swapna_item_id] || '')
        : (generalHeadNames[d.general_head_id] || ''),
      parseFloat(d.amount),
      receipt ? (receipt.is_paid ? 'Paid' : 'Pending') : 'Paid',
      new Date(d.created_at).toLocaleDateString('en-IN')
    ]);
  });

  const total = currentReportDonations.reduce((s, d) => s + parseFloat(d.amount), 0);
  wsData.push(['', '', '', '', 'TOTAL', total, '', '']);

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(wsData);
  ws['!cols'] = [4, 24, 12, 14, 28, 14, 10, 14].map(w => ({ wch: w }));
  XLSX.utils.book_append_sheet(wb, ws, 'Donations');
  XLSX.writeFile(wb, `${eventData?.name || 'report'}-donations.xlsx`);
  showToast('Excel downloaded!', 'success');
}

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src; s.onload = resolve; s.onerror = reject;
    document.head.appendChild(s);
  });
}

function downloadFile(content, filename, type) {
  const blob = new Blob([content], { type });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
