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
}

async function loadReport() {
  const eventId = document.getElementById('report-event-select').value;
  if (!eventId) return;
  currentReportEventId = eventId;

  const el = document.getElementById('report-content');
  el.innerHTML = '<p style="color:var(--text-muted);padding:16px;">Loading...</p>';

  const [
    { data: donations },
    { data: swapnas },
    { data: generalHeads },
    { data: eventData }
  ] = await Promise.all([
    db.from('donations').select('*').eq('event_id', eventId).order('created_at'),
    db.from('swapna').select('*, swapna_items(*)').eq('event_id', eventId).order('display_order'),
    db.from('general_heads').select('*').eq('event_id', eventId).order('display_order'),
    db.from('events').select('*').eq('id', eventId).single()
  ]);

  currentReportDonations = donations || [];

  if (!donations || donations.length === 0) {
    el.innerHTML = `<div class="card"><div class="empty-state"><div class="empty-icon">📊</div><p>No donations recorded for this event.</p></div></div>`;
    return;
  }

  const swapnaItemNames = {};
  const swapnaGroupNames = {};
  (swapnas || []).forEach(sw => {
    (sw.swapna_items || []).forEach(item => {
      swapnaItemNames[item.id] = item.name;
      swapnaGroupNames[item.id] = sw.name;
    });
  });
  const generalHeadNames = {};
  (generalHeads || []).forEach(h => { generalHeadNames[h.id] = h.name; });

  const swapnaTotals = {};
  const generalTotals = {};
  let grandTotal = 0;

  donations.forEach(d => {
    grandTotal += parseFloat(d.amount);
    if (d.head_type === 'swapna_item' && d.swapna_item_id) {
      if (!swapnaTotals[d.swapna_item_id]) swapnaTotals[d.swapna_item_id] = { total: 0, donors: [] };
      swapnaTotals[d.swapna_item_id].total += parseFloat(d.amount);
      swapnaTotals[d.swapna_item_id].donors.push(d);
    }
    if (d.head_type === 'general_head' && d.general_head_id) {
      if (!generalTotals[d.general_head_id]) generalTotals[d.general_head_id] = { total: 0, donors: [] };
      generalTotals[d.general_head_id].total += parseFloat(d.amount);
      generalTotals[d.general_head_id].donors.push(d);
    }
  });

  const adminActions = isAdmin();

  el.innerHTML = `
    <!-- Summary -->
    <div class="card" style="background:var(--primary);color:white;">
      <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:12px;">
        <div>
          <div style="font-size:13px;opacity:0.8;">${eventData.name}</div>
          <div style="font-size:32px;font-weight:800;margin-top:4px;">${formatAmount(grandTotal)}</div>
          <div style="font-size:12px;opacity:0.7;margin-top:2px;">${donations.length} total donations</div>
        </div>
        <div style="display:flex;flex-direction:column;gap:8px;align-items:flex-end;">
          <button class="btn-accent" onclick="printReport()">🖨 Print</button>
          <button class="btn-accent" onclick="exportReportCSV()">📥 CSV</button>
          <button class="btn-accent" onclick="exportReportExcel()">📊 Excel</button>
        </div>
      </div>
    </div>

    <!-- Swapna Report -->
    ${swapnas && swapnas.length > 0 ? `
    <div class="card">
      <div class="card-title">🔶 Swapna Summary</div>
      ${swapnas.map(sw => {
        const items = sw.swapna_items || [];
        const swTotal = items.reduce((sum, item) => sum + (swapnaTotals[item.id]?.total || 0), 0);
        return `
          <div style="margin-bottom:16px;">
            <div style="display:flex;justify-content:space-between;font-weight:700;color:var(--primary);padding:8px 0;border-bottom:2px solid var(--border);">
              <span>${sw.name}</span>
              <span>${formatAmount(swTotal)}</span>
            </div>
            ${items.map(item => {
              const t = swapnaTotals[item.id];
              if (!t) return `<div style="padding:6px 0 6px 12px;font-size:13px;display:flex;justify-content:space-between;border-bottom:1px solid var(--border);"><span>${item.name}</span><span style="color:var(--text-muted);">₹0</span></div>`;
              return `
                <div style="padding:6px 0 6px 12px;border-bottom:1px solid var(--border);">
                  <div style="display:flex;justify-content:space-between;font-size:13px;">
                    <span>${item.name}</span>
                    <strong>${formatAmount(t.total)}</strong>
                  </div>
                  ${t.donors.map(d => `
                    <div style="font-size:11px;color:var(--text-muted);padding-left:8px;margin-top:2px;">
                      • ${d.donor_name} (Family: ${d.family_no || '—'}) — ${formatAmount(d.amount)}
                    </div>
                  `).join('')}
                </div>
              `;
            }).join('')}
          </div>
        `;
      }).join('')}
    </div>
    ` : ''}

    <!-- General Heads Report -->
    ${generalHeads && generalHeads.length > 0 ? `
    <div class="card">
      <div class="card-title">🔷 General Heads Summary</div>
      ${generalHeads.map(h => {
        const t = generalTotals[h.id];
        if (!t) return `<div style="display:flex;justify-content:space-between;padding:10px 0;border-bottom:1px solid var(--border);font-size:13px;"><span>${h.name}</span><span style="color:var(--text-muted);">₹0</span></div>`;
        return `
          <div style="padding:10px 0;border-bottom:1px solid var(--border);">
            <div style="display:flex;justify-content:space-between;font-size:14px;">
              <strong>${h.name}</strong>
              <strong style="color:var(--primary);">${formatAmount(t.total)}</strong>
            </div>
            ${t.donors.map(d => `
              <div style="font-size:11px;color:var(--text-muted);padding-left:8px;margin-top:2px;">
                • ${d.donor_name} (Family: ${d.family_no || '—'}) — ${formatAmount(d.amount)} ${d.note ? '| ' + d.note : ''}
              </div>
            `).join('')}
          </div>
        `;
      }).join('')}
    </div>
    ` : ''}

    <!-- All Donations Table -->
    <div class="card">
      <div class="card-title">All Donations</div>
      <div style="overflow-x:auto;">
        <table class="data-table">
          <thead>
            <tr><th>#</th><th>Donor</th><th>Family No.</th><th>Head</th><th>Amount</th><th>Note</th><th>Time</th><th>Actions</th></tr>
          </thead>
          <tbody>
            ${donations.map((d, i) => {
              const isSwapna = d.head_type === 'swapna_item';
              const headLabel = isSwapna
                ? (swapnaGroupNames[d.swapna_item_id] || 'Swapna') + ' → ' + (swapnaItemNames[d.swapna_item_id] || '')
                : (generalHeadNames[d.general_head_id] || 'General');
              return `
              <tr>
                <td>${i + 1}</td>
                <td>${d.donor_name}</td>
                <td>${d.family_no || '—'}</td>
                <td><span class="badge ${isSwapna ? 'badge-swapna' : 'badge-general'}" title="${headLabel}">${isSwapna ? 'Swapna' : 'General'}</span></td>
                <td><strong>${formatAmount(d.amount)}</strong></td>
                <td style="font-size:12px;">${d.note || '—'}</td>
                <td style="font-size:11px;color:var(--text-muted);">${new Date(d.created_at).toLocaleString('en-IN')}</td>
                <td>
                  <div style="display:flex;gap:4px;">
                    <button class="btn-sm btn-secondary" title="Receipt" onclick="showDonationReceipt('${d.id}')">🧾</button>
                    ${adminActions ? `
                      <button class="btn-sm" style="background:#4CAF50;color:white;" title="Edit" onclick="showEditDonationModal('${d.id}','reports')">✏️</button>
                      <button class="btn-sm btn-danger" title="Delete" onclick="deleteDonation('${d.id}','reports')">✕</button>
                    ` : ''}
                  </div>
                </td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

function printReport() {
  window.print();
}

// ========== CSV EXPORT ==========
async function exportReportCSV() {
  if (!currentReportEventId || currentReportDonations.length === 0) {
    showToast('No data to export', 'error'); return;
  }

  const [{ data: eventData }, { data: swapnas }, { data: generalHeads }] = await Promise.all([
    db.from('events').select('name').eq('id', currentReportEventId).single(),
    db.from('swapna').select('*, swapna_items(*)').eq('event_id', currentReportEventId),
    db.from('general_heads').select('*').eq('event_id', currentReportEventId)
  ]);

  const swapnaItemNames = {}, swapnaGroupNames = {}, generalHeadNames = {};
  (swapnas || []).forEach(sw => (sw.swapna_items || []).forEach(item => {
    swapnaItemNames[item.id] = item.name;
    swapnaGroupNames[item.id] = sw.name;
  }));
  (generalHeads || []).forEach(h => { generalHeadNames[h.id] = h.name; });

  const headers = ['#', 'Donor Name', 'Family No', 'Head Type', 'Head Name', 'Item', 'Amount', 'Note', 'Date Time'];
  const rows = currentReportDonations.map((d, i) => {
    const isSwapna = d.head_type === 'swapna_item';
    return [
      i + 1,
      d.donor_name,
      d.family_no || '',
      isSwapna ? 'Swapna' : 'General',
      isSwapna ? (swapnaGroupNames[d.swapna_item_id] || '') : (generalHeadNames[d.general_head_id] || ''),
      isSwapna ? (swapnaItemNames[d.swapna_item_id] || '') : '',
      d.amount,
      d.note || '',
      new Date(d.created_at).toLocaleString('en-IN')
    ];
  });

  const csv = '﻿' + [headers, ...rows]
    .map(row => row.map(c => `"${String(c).replace(/"/g, '""')}"`).join(','))
    .join('\n');

  downloadFile(csv, `${eventData?.name || 'donations'}-report.csv`, 'text/csv;charset=utf-8;');
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

  const [{ data: eventData }, { data: swapnas }, { data: generalHeads }] = await Promise.all([
    db.from('events').select('name').eq('id', currentReportEventId).single(),
    db.from('swapna').select('*, swapna_items(*)').eq('event_id', currentReportEventId),
    db.from('general_heads').select('*').eq('event_id', currentReportEventId)
  ]);

  const swapnaItemNames = {}, swapnaGroupNames = {}, generalHeadNames = {};
  (swapnas || []).forEach(sw => (sw.swapna_items || []).forEach(item => {
    swapnaItemNames[item.id] = item.name;
    swapnaGroupNames[item.id] = sw.name;
  }));
  (generalHeads || []).forEach(h => { generalHeadNames[h.id] = h.name; });

  const wsData = [['#', 'Donor Name', 'Family No', 'Head Type', 'Head Name', 'Item', 'Amount (₹)', 'Note', 'Date Time']];
  currentReportDonations.forEach((d, i) => {
    const isSwapna = d.head_type === 'swapna_item';
    wsData.push([
      i + 1, d.donor_name, d.family_no || '',
      isSwapna ? 'Swapna' : 'General',
      isSwapna ? (swapnaGroupNames[d.swapna_item_id] || '') : (generalHeadNames[d.general_head_id] || ''),
      isSwapna ? (swapnaItemNames[d.swapna_item_id] || '') : '',
      parseFloat(d.amount), d.note || '',
      new Date(d.created_at).toLocaleString('en-IN')
    ]);
  });

  const total = currentReportDonations.reduce((s, d) => s + parseFloat(d.amount), 0);
  wsData.push(['', '', '', '', '', 'TOTAL', total, '', '']);

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(wsData);
  ws['!cols'] = [4, 22, 12, 10, 22, 22, 12, 22, 20].map(w => ({ wch: w }));
  XLSX.utils.book_append_sheet(wb, ws, 'Donations');
  XLSX.writeFile(wb, `${eventData?.name || 'donations'}-report.xlsx`);
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
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
