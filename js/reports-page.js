// ==========================================
// DERASAR BOLI - Reports Page
// All-time view by default; optional event filter
// ==========================================

let currentReportEventId = 'all';
let currentReportDonations = [];

async function renderReports() {
  const content = document.getElementById('page-content');

  const { data: events } = await db
    .from('events')
    .select('*')
    .order('created_at', { ascending: false });

  content.innerHTML = `
    <div class="card">
      <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap;">
        <div class="card-title" style="margin:0;">📊 Reports</div>
        <select id="report-event-select" onchange="loadReport()"
          style="flex:1;min-width:180px;padding:8px 10px;border:1.5px solid var(--border);border-radius:8px;font-size:13px;background:white;">
          <option value="all">— All Events (All Time) —</option>
          ${(events || []).map(ev => `<option value="${ev.id}">${ev.name}</option>`).join('')}
        </select>
      </div>
    </div>
    <div id="report-content"><p style="color:var(--text-muted);padding:8px 0;">Loading...</p></div>
  `;

  loadReport();
}

async function loadReport() {
  const sel     = document.getElementById('report-event-select');
  const eventId = sel ? sel.value : 'all';
  currentReportEventId = eventId;

  const el = document.getElementById('report-content');
  el.innerHTML = '<p style="color:var(--text-muted);padding:8px 0;">Loading...</p>';

  // ── Fetch data ────────────────────────────────────────────────────────────
  let receiptsQ  = db.from('receipts').select('*').order('created_at', { ascending: false });
  let donationsQ = db.from('donations').select('*').order('created_at', { ascending: false });
  if (eventId !== 'all') {
    receiptsQ  = receiptsQ.eq('event_id', eventId);
    donationsQ = donationsQ.eq('event_id', eventId);
  }

  const [
    { data: receipts },
    { data: donations },
    { data: swapnas },
    { data: generalHeads }
  ] = await Promise.all([
    receiptsQ,
    donationsQ,
    db.from('swapna').select('*, swapna_items(*)').order('display_order'),
    db.from('general_heads').select('*').is('event_id', null).order('display_order')
  ]);

  currentReportDonations = donations || [];

  if (!receipts || receipts.length === 0) {
    el.innerHTML = `<div class="card"><div class="empty-state"><div class="empty-icon">📊</div><p>No donations recorded yet.</p></div></div>`;
    return;
  }

  // ── Lookup maps ───────────────────────────────────────────────────────────
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

  // ── Aggregate ─────────────────────────────────────────────────────────────
  let grandTotal = 0, paidTotal = 0, pendingTotal = 0;
  const headTotals = {};

  const addHead = (id, name, amount, isPaid) => {
    if (!headTotals[id]) headTotals[id] = { name, paid: 0, pending: 0 };
    if (isPaid) headTotals[id].paid += amount;
    else        headTotals[id].pending += amount;
  };

  (donations || []).forEach(d => {
    const amount  = parseFloat(d.amount || 0);
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

  const pendingReceipts = (receipts || []).filter(r => !r.is_paid)
    .sort((a, b) => a.created_at.localeCompare(b.created_at));

  // donor rows sorted by family_no naturally
  const donorRows = (receipts || []).slice().sort((a, b) => {
    const parseF = s => { const m = (s||'').match(/^([A-Za-z]+)-?(\d+)$/); return m ? [m[1].toUpperCase(), parseInt(m[2])] : [s||'ZZZ', 0]; };
    const [aL, aN] = parseF(a.family_no); const [bL, bN] = parseF(b.family_no);
    return aL < bL ? -1 : aL > bL ? 1 : aN - bN;
  });

  const adminActions = isAdmin();
  const scopeLabel  = eventId === 'all' ? 'All Events' : (sel?.options[sel.selectedIndex]?.text || '');

  // ── Render ────────────────────────────────────────────────────────────────
  el.innerHTML = `

    <!-- 1. Summary -->
    <div class="card" style="background:var(--primary);color:white;">
      <div style="font-size:13px;opacity:.75;margin-bottom:8px;">📊 ${scopeLabel}</div>
      <div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:14px;">
        <div style="flex:1;min-width:100px;">
          <div style="font-size:11px;opacity:.7;">Grand Total</div>
          <div style="font-size:28px;font-weight:800;">${formatAmount(grandTotal)}</div>
          <div style="font-size:11px;opacity:.6;">${receipts.length} receipts</div>
        </div>
        <div style="flex:1;min-width:100px;background:rgba(255,255,255,.13);border-radius:8px;padding:10px;">
          <div style="font-size:11px;opacity:.75;">✅ Collected</div>
          <div style="font-size:22px;font-weight:700;">${formatAmount(paidTotal)}</div>
          <div style="font-size:11px;opacity:.6;">${receipts.filter(r=>r.is_paid).length} receipts</div>
        </div>
        <div style="flex:1;min-width:100px;background:rgba(255,152,0,.35);border-radius:8px;padding:10px;">
          <div style="font-size:11px;opacity:.75;">⏳ Pending</div>
          <div style="font-size:22px;font-weight:700;">${formatAmount(pendingTotal)}</div>
          <div style="font-size:11px;opacity:.6;">${pendingReceipts.length} receipt(s)</div>
        </div>
      </div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;">
        <button onclick="printReport()"       style="background:rgba(255,255,255,.2);border:1px solid rgba(255,255,255,.4);color:white;padding:7px 14px;border-radius:6px;font-size:12px;cursor:pointer;">🖨 Print</button>
        <button onclick="exportReportCSV()"   style="background:rgba(255,255,255,.2);border:1px solid rgba(255,255,255,.4);color:white;padding:7px 14px;border-radius:6px;font-size:12px;cursor:pointer;">📥 CSV</button>
        <button onclick="exportReportExcel()" style="background:rgba(255,255,255,.2);border:1px solid rgba(255,255,255,.4);color:white;padding:7px 14px;border-radius:6px;font-size:12px;cursor:pointer;">📊 Excel</button>
      </div>
    </div>

    <!-- 2. Head-wise -->
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
            ${Object.values(headTotals).length === 0
              ? `<tr><td colspan="4" style="text-align:center;color:var(--text-muted);">No head-wise data</td></tr>`
              : Object.values(headTotals)
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

    <!-- 3. Pending -->
    <div class="card" style="border-left:4px solid ${pendingReceipts.length ? '#ff9800' : '#4CAF50'};">
      <div class="card-title">${pendingReceipts.length
        ? `⏳ Pending Payments — ${pendingReceipts.length} receipt(s) · ${formatAmount(pendingTotal)}`
        : '✅ No Pending Payments'}</div>
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
                    ${adminActions ? `<button class="btn-sm btn-primary" onclick="collectPaymentModal('${r.id}','${r.receipt_no}',${r.total_amount})">💰 Collect</button>` : ''}
                  </div>
                </td>
              </tr>`).join('')}
          </tbody>
        </table>
      </div>` : '<p style="color:#4CAF50;font-size:13px;margin:0;">All payments collected. 🎉</p>'}
    </div>

    <!-- 4. All Donors -->
    <div class="card">
      <div class="card-title">👥 All Donors</div>
      <div style="overflow-x:auto;">
        <table class="data-table">
          <thead>
            <tr>
              <th>#</th><th>Name</th><th>Family No.</th><th>Receipt No.</th>
              <th style="text-align:right;color:#4CAF50;">✅ Paid</th>
              <th style="text-align:right;color:#ff9800;">⏳ Pending</th>
              <th style="text-align:right;">Total</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            ${donorRows.map((r, i) => `
              <tr style="${!r.is_paid ? 'background:#fffbf0;' : ''}">
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

// ── CSV Export ────────────────────────────────────────────────────────────────
async function exportReportCSV() {
  if (!currentReportDonations.length) { showToast('No data to export', 'error'); return; }

  const [{ data: swapnas }, { data: generalHeads }, { data: receipts }] = await Promise.all([
    db.from('swapna').select('*, swapna_items(*)'),
    db.from('general_heads').select('*').is('event_id', null),
    currentReportEventId === 'all'
      ? db.from('receipts').select('*')
      : db.from('receipts').select('*').eq('event_id', currentReportEventId)
  ]);

  const siN = {}, sgN = {}, ghN = {}, rMap = {};
  (swapnas||[]).forEach(sw=>(sw.swapna_items||[]).forEach(i=>{siN[i.id]=i.name;sgN[i.id]=sw.name;}));
  (generalHeads||[]).forEach(h=>{ghN[h.id]=h.name;});
  (receipts||[]).forEach(r=>{rMap[r.id]=r;});

  const headers = ['#','Donor Name','Family No','Receipt No','Head','Amount','Status','Date'];
  const rows = currentReportDonations.map((d,i) => {
    const isSw = d.head_type === 'swapna_item';
    const rec  = rMap[d.receipt_id];
    return [i+1, d.donor_name, d.family_no||'', rec?.receipt_no||'',
      isSw ? (sgN[d.swapna_item_id]||'')+'→'+(siN[d.swapna_item_id]||'') : (ghN[d.general_head_id]||''),
      d.amount, rec?(rec.is_paid?'Paid':'Pending'):'Paid',
      new Date(d.created_at).toLocaleDateString('en-IN')];
  });

  const csv = '﻿' + [headers,...rows].map(r=>r.map(c=>`"${String(c).replace(/"/g,'""')}"`).join(',')).join('\n');
  downloadFile(csv, `derasar-boli-report.csv`, 'text/csv;charset=utf-8;');
  showToast('CSV downloaded!','success');
}

// ── Excel Export ──────────────────────────────────────────────────────────────
async function exportReportExcel() {
  if (!currentReportDonations.length) { showToast('No data to export','error'); return; }
  if (typeof XLSX === 'undefined') { showToast('Loading...',''); await loadScript('https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js'); }

  const [{ data: swapnas }, { data: generalHeads }, { data: receipts }] = await Promise.all([
    db.from('swapna').select('*, swapna_items(*)'),
    db.from('general_heads').select('*').is('event_id', null),
    currentReportEventId === 'all'
      ? db.from('receipts').select('*')
      : db.from('receipts').select('*').eq('event_id', currentReportEventId)
  ]);

  const siN={},sgN={},ghN={},rMap={};
  (swapnas||[]).forEach(sw=>(sw.swapna_items||[]).forEach(i=>{siN[i.id]=i.name;sgN[i.id]=sw.name;}));
  (generalHeads||[]).forEach(h=>{ghN[h.id]=h.name;});
  (receipts||[]).forEach(r=>{rMap[r.id]=r;});

  const wsData=[['#','Donor Name','Family No','Receipt No','Head','Amount (₹)','Status','Date']];
  currentReportDonations.forEach((d,i)=>{
    const isSw=d.head_type==='swapna_item'; const rec=rMap[d.receipt_id];
    wsData.push([i+1,d.donor_name,d.family_no||'',rec?.receipt_no||'',
      isSw?(sgN[d.swapna_item_id]||'')+'→'+(siN[d.swapna_item_id]||''):(ghN[d.general_head_id]||''),
      parseFloat(d.amount),rec?(rec.is_paid?'Paid':'Pending'):'Paid',
      new Date(d.created_at).toLocaleDateString('en-IN')]);
  });
  const total=currentReportDonations.reduce((s,d)=>s+parseFloat(d.amount),0);
  wsData.push(['','','','','TOTAL',total,'','']);

  const wb=XLSX.utils.book_new();
  const ws=XLSX.utils.aoa_to_sheet(wsData);
  ws['!cols']=[4,24,12,14,28,14,10,14].map(w=>({wch:w}));
  XLSX.utils.book_append_sheet(wb,ws,'Donations');
  XLSX.writeFile(wb,'derasar-boli-report.xlsx');
  showToast('Excel downloaded!','success');
}

function loadScript(src) {
  return new Promise((res,rej)=>{const s=document.createElement('script');s.src=src;s.onload=res;s.onerror=rej;document.head.appendChild(s);});
}
function downloadFile(content,filename,type) {
  const blob=new Blob([content],{type});const url=URL.createObjectURL(blob);
  const a=document.createElement('a');a.href=url;a.download=filename;
  document.body.appendChild(a);a.click();document.body.removeChild(a);URL.revokeObjectURL(url);
}
