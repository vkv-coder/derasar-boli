// ==========================================
// DERASAR BOLI - Reports Page
// ==========================================

let reportEventId = null;
let reportAllDonations = [];
let reportSwapnaTree = [];
let reportSwapnaItems = [];
let reportGeneralHeads = [];

// ========== RENDER REPORTS PAGE ==========
async function renderReports() {
  if (!isAdmin()) {
    document.getElementById('page-content').innerHTML = `
      <div class="card" style="text-align:center;padding:40px;">
        <div style="font-size:48px;margin-bottom:12px;">🔒</div>
        <p style="color:var(--danger);font-weight:600;">Admin access only.</p>
      </div>`;
    return;
  }

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
        <select id="report-event-select" onchange="onReportEventChange()">
          <option value="">-- Select Event --</option>
          ${(events || []).map(ev => `<option value="${ev.id}">${ev.name}</option>`).join('')}
        </select>
      </div>
    </div>
    <div id="report-content"></div>
  `;

  if (events && events.length === 1) {
    document.getElementById('report-event-select').value = events[0].id;
    onReportEventChange();
  }
}

async function onReportEventChange() {
  reportEventId = document.getElementById('report-event-select').value;
  if (!reportEventId) return;
  await loadReport();
}

// ========== LOAD FULL REPORT ==========
async function loadReport() {
  const el = document.getElementById('report-content');
  el.innerHTML = `<div class="card" style="text-align:center;padding:30px;color:var(--text-muted);">Loading...</div>`;

  const [
    { data: donations },
    { data: swapnaTree },
    { data: swapnaItems },
    { data: generalHeads },
    { data: receipts }
  ] = await Promise.all([
    db.from('donations').select('*').or(`event_id.eq.${reportEventId},event_id.is.null`).order('created_at', { ascending: true }),
    db.from('swapna').select('*').eq('event_id', reportEventId).order('sort_order'),
    db.from('swapna_items').select('*'),
    db.from('general_heads').select('*').order('display_order'),
    db.from('receipts').select('*').or(`event_id.eq.${reportEventId},event_id.is.null`)
  ]);

  reportAllDonations = donations || [];
  reportSwapnaTree = swapnaTree || [];
  reportSwapnaItems = swapnaItems || [];
  reportGeneralHeads = generalHeads || [];

  // Map receipt_id → receipt for quick lookup
  const receiptMap = {};
  (receipts || []).forEach(r => { receiptMap[r.id] = r; });

  // Attach receipt data to donations
  reportAllDonations.forEach(d => {
    d._receipt = d.receipt_id ? (receiptMap[d.receipt_id] || null) : null;
  });

  // Summary totals
  const totalEntered = reportAllDonations.reduce((s, d) => s + parseFloat(d.amount || 0), 0);
  const totalReceived = reportAllDonations.reduce((s, d) => s + parseFloat(d.received_amount || 0), 0);
  const totalPending = reportAllDonations.filter(d => !d.received_amount).length;
  const totalMismatch = reportAllDonations.filter(d => d.received_amount && parseFloat(d.received_amount) !== parseFloat(d.amount)).length;
  const totalVerified = reportAllDonations.filter(d => d.received_amount && parseFloat(d.received_amount) === parseFloat(d.amount) && d.receipt_id).length;

  // Build head filter options (main heads only)
  const mainSwapnaHeads = reportSwapnaTree.filter(s => !s.parent_id);
  const mainGeneralHeads = reportGeneralHeads.filter(h => !h.parent_id);

  el.innerHTML = `
    <!-- Summary Cards -->
    <div style="display:grid;grid-template-columns:repeat(2,1fr);gap:10px;margin-bottom:12px;">
      <div class="card" style="text-align:center;padding:14px;margin-bottom:0;">
        <div style="font-size:11px;color:var(--text-muted);">Total Entered</div>
        <div style="font-size:22px;font-weight:800;color:var(--primary);">₹${totalEntered.toLocaleString('en-IN')}</div>
        <div style="font-size:11px;color:var(--text-muted);">${reportAllDonations.length} entries</div>
      </div>
      <div class="card" style="text-align:center;padding:14px;margin-bottom:0;">
        <div style="font-size:11px;color:var(--text-muted);">Total Received</div>
        <div style="font-size:22px;font-weight:800;color:#4CAF50;">₹${totalReceived.toLocaleString('en-IN')}</div>
        <div style="font-size:11px;color:var(--text-muted);">${totalVerified} verified</div>
      </div>
      <div class="card" style="text-align:center;padding:14px;margin-bottom:0;border-left:4px solid #ff9800;">
        <div style="font-size:11px;color:var(--text-muted);">Pending</div>
        <div style="font-size:22px;font-weight:800;color:#ff9800;">${totalPending}</div>
        <div style="font-size:11px;color:var(--text-muted);">not yet received</div>
      </div>
      <div class="card" style="text-align:center;padding:14px;margin-bottom:0;border-left:4px solid var(--danger);">
        <div style="font-size:11px;color:var(--text-muted);">Mismatch</div>
        <div style="font-size:22px;font-weight:800;color:var(--danger);">${totalMismatch}</div>
        <div style="font-size:11px;color:var(--text-muted);">amount differs</div>
      </div>
    </div>

    <!-- Filter + Excel -->
    <div class="card">
      <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
        <select id="report-head-filter" onchange="applyReportFilter()" style="flex:1;min-width:160px;">
          <option value="">-- All Heads --</option>
          <optgroup label="🔶 Swapna Heads">
            ${mainSwapnaHeads.map(h => `<option value="swapna_${h.id}">${h.name}</option>`).join('')}
          </optgroup>
          <optgroup label="🔷 General Heads">
            ${mainGeneralHeads.map(h => `<option value="general_${h.id}">${h.name}</option>`).join('')}
          </optgroup>
        </select>
        <button class="btn-primary" style="white-space:nowrap;" onclick="downloadExcelReport()">⬇️ Excel</button>
      </div>
    </div>

    <!-- Donations Table -->
    <div class="card" style="padding:0;">
      <div id="report-table-container" style="overflow-x:auto;"></div>
    </div>
  `;

  renderReportTable(reportAllDonations, receiptMap);
}

// ========== FILTER ==========
async function applyReportFilter() {
  const val = document.getElementById('report-head-filter').value;

  let filtered = reportAllDonations;

  if (val) {
    const [type, id] = val.split('_');

    if (type === 'swapna') {
      // Get all descendants of this swapna head
      const descendantIds = getSwapnaDescendants(id);
      filtered = reportAllDonations.filter(d =>
        (d.swapna_id && descendantIds.includes(d.swapna_id)) ||
        (d.swapna_item_id && descendantIds.includes(d.swapna_item_id))
      );
    } else if (type === 'general') {
      // Get all sub-heads under this general head
      const subIds = reportGeneralHeads
        .filter(h => h.parent_id === id || h.id === id)
        .map(h => h.id);
      filtered = reportAllDonations.filter(d =>
        d.general_head_id && subIds.includes(d.general_head_id)
      );
    }
  }

  renderReportTable(filtered);
}

function getSwapnaDescendants(parentId) {
  const ids = [parentId];
  const children = reportSwapnaTree.filter(s => s.parent_id === parentId);
  children.forEach(c => {
    ids.push(...getSwapnaDescendants(c.id));
  });
  return ids;
}

// ========== GET HEAD NAME FOR DONATION ==========
function getDonationHeadName(d) {
  if (d.head_type === 'swapna_item' && d.swapna_item_id) {
    // Look in swapna_items table first
    const item = reportSwapnaItems.find(s => s.id === d.swapna_item_id);
    if (item) {
      // Find parent swapna head
      const parent = reportSwapnaTree.find(s => s.id === item.swapna_id);
      if (parent) {
        const grandParent = reportSwapnaTree.find(s => s.id === parent.parent_id);
        if (grandParent) return `${grandParent.name} → ${parent.name} → ${item.name}`;
        return `${parent.name} → ${item.name}`;
      }
      return item.name;
    }
    // Fallback: look in swapna tree
    const sw = reportSwapnaTree.find(s => s.id === d.swapna_item_id);
    if (sw) {
      const parent = reportSwapnaTree.find(s => s.id === sw.parent_id);
      const grandParent = parent ? reportSwapnaTree.find(s => s.id === parent.parent_id) : null;
      if (grandParent) return `${grandParent.name} → ${parent.name} → ${sw.name}`;
      if (parent) return `${parent.name} → ${sw.name}`;
      return sw.name;
    }
  }
  if (d.head_type === 'swapna' && d.swapna_id) {
    const sw = reportSwapnaTree.find(s => s.id === d.swapna_id);
    if (sw) {
      const parent = reportSwapnaTree.find(s => s.id === sw.parent_id);
      const grandParent = parent ? reportSwapnaTree.find(s => s.id === parent.parent_id) : null;
      if (grandParent) return `${grandParent.name} → ${parent.name} → ${sw.name}`;
      if (parent) return `${parent.name} → ${sw.name}`;
      return sw.name;
    }
  }
  if (d.head_type === 'general_head' && d.general_head_id) {
    const gh = reportGeneralHeads.find(h => h.id === d.general_head_id);
    if (gh) {
      const parent = reportGeneralHeads.find(h => h.id === gh.parent_id);
      return parent ? `${parent.name} → ${gh.name}` : gh.name;
    }
  }
  return '—';
}

// ========== GET STATUS ==========
function getDonationStatus(d) {
  if (!d.received_amount && d.received_amount !== 0) {
    return { label: 'PENDING', color: '#ff9800', bg: '#FFF8E1' };
  }
  const entered = parseFloat(d.amount || 0);
  const received = parseFloat(d.received_amount || 0);
  if (received === entered && d.receipt_id) {
    return { label: 'VERIFIED', color: '#4CAF50', bg: '#E8F5E9' };
  }
  if (received === entered && !d.receipt_id) {
    return { label: 'AMT MATCHED', color: '#2196F3', bg: '#E3F2FD' };
  }
  return { label: 'MISMATCH', color: '#f44336', bg: '#FFEBEE' };
}

// ========== RENDER TABLE ==========
function renderReportTable(donations) {
  const el = document.getElementById('report-table-container');
  if (!donations || donations.length === 0) {
    el.innerHTML = `<div class="empty-state" style="padding:30px;text-align:center;">
      <div style="font-size:36px;">📭</div>
      <p style="color:var(--text-muted);">No donations found.</p>
    </div>`;
    return;
  }

  el.innerHTML = `
    <table class="data-table" style="min-width:800px;">
      <thead>
        <tr>
          <th>#</th>
          <th>Donor Name</th>
          <th>Phone</th>
          <th>Family</th>
          <th>Head</th>
          <th>Amt Entered</th>
          <th>Amt Received</th>
          <th>Status</th>
          <th>Receipt No</th>
          <th>Actions</th>
        </tr>
      </thead>
      <tbody>
        ${donations.map((d, i) => {
          const status = getDonationStatus(d);
          const headName = getDonationHeadName(d);
          const receiptNo = d._receipt ? d._receipt.receipt_no : (d.receipt_id ? '...' : '—');
          return `
            <tr style="background:${status.bg};">
              <td style="color:var(--text-muted);font-size:11px;">${i + 1}</td>
              <td><strong>${d.donor_name || '—'}</strong></td>
              <td style="font-size:12px;">${d.phone || '—'}</td>
              <td style="font-size:12px;">${d.family_no || '—'}</td>
              <td style="font-size:11px;max-width:200px;word-break:break-word;">${headName}</td>
              <td><strong>₹${parseFloat(d.amount || 0).toLocaleString('en-IN')}</strong></td>
              <td>
                ${isAdmin() ? `
                  <div style="display:flex;align-items:center;gap:4px;">
                    <input type="number" 
                      value="${d.received_amount || ''}" 
                      placeholder="0"
                      min="0"
                      style="width:80px;padding:4px 6px;border:1.5px solid var(--border);border-radius:6px;font-size:13px;font-weight:600;"
                      onchange="saveReceivedAmount('${d.id}', this.value)"
                    />
                  </div>
                ` : `₹${parseFloat(d.received_amount || 0).toLocaleString('en-IN')}`}
              </td>
              <td>
                <span style="background:${status.color};color:white;padding:3px 8px;border-radius:12px;font-size:11px;font-weight:700;white-space:nowrap;">
                  ${status.label}
                </span>
              </td>
              <td style="font-size:12px;font-weight:600;color:var(--primary);">${receiptNo}</td>
              <td>
                <div style="display:flex;gap:4px;flex-wrap:wrap;">
                  ${d._receipt ? `
                    <button class="btn-sm btn-secondary" onclick="showReceiptById('${d.receipt_id}', false)" title="View Receipt">🧾</button>
                  ` : `
                    <button class="btn-sm btn-primary" onclick="processReportRow('${d.id}')" title="Generate Receipt & WhatsApp">✅</button>
                  `}
                  ${d.phone ? `
                    <button class="btn-sm" style="background:#25D366;color:white;" onclick="whatsappReportRow('${d.id}')" title="WhatsApp">📲</button>
                  ` : ''}
                </div>
              </td>
            </tr>
          `;
        }).join('')}
      </tbody>
    </table>
  `;
}

// ========== SAVE RECEIVED AMOUNT ==========
async function saveReceivedAmount(donationId, value) {
  const amount = value === '' ? null : parseFloat(value);
  const { error } = await db.from('donations')
    .update({ received_amount: amount })
    .eq('id', donationId);

  if (error) {
    showToast('Error saving: ' + error.message, 'error');
    return;
  }

  // Update local data
  const d = reportAllDonations.find(x => x.id === donationId);
  if (d) d.received_amount = amount;

  showToast('✅ Amount saved!', 'success');

  // Re-render table to update status color
  await loadReport();
}

// ========== PROCESS ROW (Generate Receipt + WhatsApp) ==========
async function processReportRow(donationId) {
  const d = reportAllDonations.find(x => x.id === donationId);
  if (!d) return;

  const status = getDonationStatus(d);
  if (status.label === 'PENDING') {
    showToast('Please enter received amount first', 'error');
    return;
  }
  if (status.label === 'MISMATCH') {
    if (!confirm(`Amount mismatch!\nEntered: ₹${d.amount}\nReceived: ₹${d.received_amount}\n\nProceed and generate receipt for ₹${d.received_amount}?`)) return;
  }

  // Generate receipt
  showToast('Generating receipt...', 'success');
  await showDonationReceipt(donationId);

  // Open WhatsApp if phone exists
  if (d.phone) {
    setTimeout(() => {
      whatsappReportRow(donationId);
    }, 1500);
  }
}

// ========== WHATSAPP ROW ==========
function whatsappReportRow(donationId) {
  const d = reportAllDonations.find(x => x.id === donationId);
  if (!d) return;

  const headName = getDonationHeadName(d);
  const receiptNo = d._receipt ? d._receipt.receipt_no : '';
  const msg =
    `🛕 *Derasar Boli - Receipt*\n\n` +
    `👤 Donor: ${d.donor_name || '—'}\n` +
    `🏠 Family No: ${d.family_no || '—'}\n` +
    `📋 Head: ${headName}\n` +
    `💰 Amount: ₹${parseFloat(d.amount || 0).toLocaleString('en-IN')}\n` +
    (receiptNo ? `🧾 Receipt No: ${receiptNo}\n` : '') +
    `\n🙏 Jai Jinendra`;

  const phone = d.phone ? '91' + d.phone : '';
  const url = phone
    ? `https://wa.me/${phone}?text=${encodeURIComponent(msg)}`
    : `https://wa.me/?text=${encodeURIComponent(msg)}`;

  window.open(url, '_blank');
}

// ========== EXCEL DOWNLOAD ==========
async function downloadExcelReport() {
  if (typeof XLSX === 'undefined') {
    showToast('Excel library not loaded. Check internet connection.', 'error');
    return;
  }

  showToast('Preparing Excel...', 'success');

  const wb = XLSX.utils.book_new();

  // ---- Summary Sheet ----
  const totalEntered = reportAllDonations.reduce((s, d) => s + parseFloat(d.amount || 0), 0);
  const totalReceived = reportAllDonations.reduce((s, d) => s + parseFloat(d.received_amount || 0), 0);
  const summaryData = [
    ['Derasar Boli - Report Summary'],
    ['Generated on', new Date().toLocaleString('en-IN')],
    [],
    ['Total Donations', reportAllDonations.length],
    ['Total Amount Entered', totalEntered],
    ['Total Amount Received', totalReceived],
    ['Pending', reportAllDonations.filter(d => !d.received_amount).length],
    ['Verified', reportAllDonations.filter(d => d.received_amount && parseFloat(d.received_amount) === parseFloat(d.amount) && d.receipt_id).length],
    ['Mismatch', reportAllDonations.filter(d => d.received_amount && parseFloat(d.received_amount) !== parseFloat(d.amount)).length],
  ];
  const summarySheet = XLSX.utils.aoa_to_sheet(summaryData);
  XLSX.utils.book_append_sheet(wb, summarySheet, 'Summary');

  // ---- One sheet per Main Swapna Head ----
  const mainSwapnaHeads = reportSwapnaTree.filter(s => !s.parent_id);
  mainSwapnaHeads.forEach(mainHead => {
    const descendantIds = getSwapnaDescendants(mainHead.id);
    const filtered = reportAllDonations.filter(d =>
      (d.swapna_id && descendantIds.includes(d.swapna_id)) ||
      (d.swapna_item_id && descendantIds.includes(d.swapna_item_id))
    );

    const rows = [
      ['#', 'Donor Name', 'Phone', 'Family No', 'Head / Sub-head', 'Amt Entered', 'Amt Received', 'Status', 'Receipt No']
    ];
    filtered.forEach((d, i) => {
      const status = getDonationStatus(d);
      const receiptNo = d._receipt ? d._receipt.receipt_no : '';
      rows.push([
        i + 1,
        d.donor_name || '',
        d.phone || '',
        d.family_no || '',
        getDonationHeadName(d),
        parseFloat(d.amount || 0),
        parseFloat(d.received_amount || 0),
        status.label,
        receiptNo
      ]);
    });

    // Add total row
    if (filtered.length > 0) {
      rows.push([]);
      rows.push(['', 'TOTAL', '', '', '',
        filtered.reduce((s, d) => s + parseFloat(d.amount || 0), 0),
        filtered.reduce((s, d) => s + parseFloat(d.received_amount || 0), 0),
        '', ''
      ]);
    }

    const sheetName = mainHead.name.substring(0, 28).replace(/[\\\/\?\*\[\]]/g, '');
    const ws = XLSX.utils.aoa_to_sheet(rows);
    ws['!cols'] = [
      {wch:4},{wch:20},{wch:13},{wch:10},{wch:40},{wch:14},{wch:14},{wch:12},{wch:14}
    ];
    XLSX.utils.book_append_sheet(wb, ws, sheetName);
  });

  // ---- General Heads Sheet ----
  const mainGeneralHeads = reportGeneralHeads.filter(h => !h.parent_id);
  mainGeneralHeads.forEach(mainHead => {
    const subIds = reportGeneralHeads
      .filter(h => h.parent_id === mainHead.id || h.id === mainHead.id)
      .map(h => h.id);
    const filtered = reportAllDonations.filter(d =>
      d.general_head_id && subIds.includes(d.general_head_id)
    );

    if (filtered.length === 0) return;

    const rows = [
      ['#', 'Donor Name', 'Phone', 'Family No', 'Head / Sub-head', 'Amt Entered', 'Amt Received', 'Status', 'Receipt No']
    ];
    filtered.forEach((d, i) => {
      const status = getDonationStatus(d);
      const receiptNo = d._receipt ? d._receipt.receipt_no : '';
      rows.push([
        i + 1,
        d.donor_name || '',
        d.phone || '',
        d.family_no || '',
        getDonationHeadName(d),
        parseFloat(d.amount || 0),
        parseFloat(d.received_amount || 0),
        status.label,
        receiptNo
      ]);
    });

    if (filtered.length > 0) {
      rows.push([]);
      rows.push(['', 'TOTAL', '', '', '',
        filtered.reduce((s, d) => s + parseFloat(d.amount || 0), 0),
        filtered.reduce((s, d) => s + parseFloat(d.received_amount || 0), 0),
        '', ''
      ]);
    }

    const sheetName = ('Gen-' + mainHead.name).substring(0, 28).replace(/[\\\/\?\*\[\]]/g, '');
    const ws = XLSX.utils.aoa_to_sheet(rows);
    ws['!cols'] = [
      {wch:4},{wch:20},{wch:13},{wch:10},{wch:40},{wch:14},{wch:14},{wch:12},{wch:14}
    ];
    XLSX.utils.book_append_sheet(wb, ws, sheetName);
  });

  // ---- All Donations Sheet ----
  const allRows = [
    ['#', 'Donor Name', 'Phone', 'Family No', 'Head Type', 'Head / Sub-head', 'Amt Entered', 'Amt Received', 'Status', 'Receipt No', 'Date']
  ];
  reportAllDonations.forEach((d, i) => {
    const status = getDonationStatus(d);
    const receiptNo = d._receipt ? d._receipt.receipt_no : '';
    allRows.push([
      i + 1,
      d.donor_name || '',
      d.phone || '',
      d.family_no || '',
      d.head_type === 'swapna_item' || d.head_type === 'swapna' ? 'Swapna' : 'General',
      getDonationHeadName(d),
      parseFloat(d.amount || 0),
      parseFloat(d.received_amount || 0),
      status.label,
      receiptNo,
      new Date(d.created_at).toLocaleDateString('en-IN')
    ]);
  });
  const allWs = XLSX.utils.aoa_to_sheet(allRows);
  allWs['!cols'] = [
    {wch:4},{wch:20},{wch:13},{wch:10},{wch:10},{wch:40},{wch:14},{wch:14},{wch:12},{wch:14},{wch:12}
  ];
  XLSX.utils.book_append_sheet(wb, allWs, 'All Donations');

  // Download
  const eventSelect = document.getElementById('report-event-select');
  const eventName = eventSelect ? eventSelect.options[eventSelect.selectedIndex]?.text || 'Report' : 'Report';
  const fileName = `DerasarBoli_${eventName.replace(/\s+/g,'_')}_${new Date().toISOString().slice(0,10)}.xlsx`;
  XLSX.writeFile(wb, fileName);
  showToast('✅ Excel downloaded!', 'success');
}
