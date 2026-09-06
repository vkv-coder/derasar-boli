// ==========================================
// DERASAR BOLI - Reports Page
// ==========================================

let reportEventId = null;
let reportAllDonations = [];
let reportSwapnaTree = [];
let reportSwapnaItems = [];
let reportGeneralHeads = [];
let reportView = 'item'; // 'item' (line-by-line accounting), 'donor' (grouped, all-time), or 'register' (audit)
let registerRows = [];
let reportTokenMap = {};      // token_id -> dr_receipt_tokens row (for resolving receipt no.)
let reportSplitsByToken = {}; // token_id -> [dr_token_splits rows]
let reportOrgPrefix = '';
let expandedSummaryRows = {}; // rowId -> bool, shared by category + item-wise summary tables

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
    .from('dr_events')
    .select('*')
    .eq('org_id', currentOrgId)
    .order('created_at', { ascending: false });

  content.innerHTML = `
    ${tokenDeskSectionHTML()}
    <div class="card">
      <div style="display:flex;gap:8px;flex-wrap:wrap;">
        <button class="btn-sm ${reportView === 'item' ? 'btn-primary' : 'btn-secondary'}" onclick="switchReportView('item')">📋 By Item</button>
        <button class="btn-sm ${reportView === 'donor' ? 'btn-primary' : 'btn-secondary'}" onclick="switchReportView('donor')">🤝 By Donor</button>
        <button class="btn-sm ${reportView === 'register' ? 'btn-primary' : 'btn-secondary'}" onclick="switchReportView('register')">🧾 Receipt Register</button>
      </div>
    </div>
    <div id="report-view-item" style="display:${reportView === 'item' ? 'block' : 'none'};">
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
    </div>
    <div id="report-view-donor" style="display:${reportView === 'donor' ? 'block' : 'none'};">
      ${donorsSectionHTML()}
    </div>
    <div id="report-view-register" style="display:${reportView === 'register' ? 'block' : 'none'};">
      ${receiptRegisterSectionHTML()}
    </div>
  `;

  await loadTokensList();

  if (reportView === 'donor') {
    await loadDonorsList();
  } else if (reportView === 'register') {
    initReceiptRegisterDates();
  } else if (events && events.length === 1) {
    document.getElementById('report-event-select').value = events[0].id;
    onReportEventChange();
  }
}

function switchReportView(view) {
  reportView = view;
  renderReports();
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
    { data: receipts },
    { data: tokens },
    { data: splits },
    { data: orgRow }
  ] = await Promise.all([
    db.from('dr_donations').select('*').eq('org_id', currentOrgId).or(`event_id.eq.${reportEventId},event_id.is.null`).order('created_at', { ascending: true }),
    db.from('dr_swapna').select('*').eq('org_id', currentOrgId).eq('event_id', reportEventId).order('sort_order'),
    db.from('dr_swapna_items').select('*').eq('org_id', currentOrgId),
    db.from('dr_general_heads').select('*').eq('org_id', currentOrgId).order('display_order'),
    db.from('dr_receipts').select('*').eq('org_id', currentOrgId).or(`event_id.eq.${reportEventId},event_id.is.null`),
    db.from('dr_receipt_tokens').select('id, receipt_no, status').eq('org_id', currentOrgId),
    db.from('dr_token_splits').select('token_id, receipt_no').eq('org_id', currentOrgId),
    db.from('dr_organizations').select('receipt_prefix').eq('id', currentOrgId).single()
  ]);

  reportAllDonations = donations || [];
  reportSwapnaTree = swapnaTree || [];
  reportSwapnaItems = swapnaItems || [];
  reportGeneralHeads = generalHeads || [];
  reportOrgPrefix = orgRow?.receipt_prefix || '';

  reportTokenMap = {};
  (tokens || []).forEach(t => { reportTokenMap[t.id] = t; });

  reportSplitsByToken = {};
  (splits || []).forEach(s => {
    if (!reportSplitsByToken[s.token_id]) reportSplitsByToken[s.token_id] = [];
    reportSplitsByToken[s.token_id].push(s);
  });

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

    <div id="category-summary-container"></div>
    <div id="item-summary-container"></div>

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
  renderCategorySummary();
  renderItemWiseSummary();
}

// ========== FILTER ==========
async function applyReportFilter() {
  const val = document.getElementById('report-head-filter').value;

  let filtered = reportAllDonations;

  if (val) {
    const [type, id] = val.split('_');

    if (type === 'swapna') {
      const descendantSwapnaIds = getSwapnaDescendants(id);
      const descendantItemIds = reportSwapnaItems
        .filter(item => descendantSwapnaIds.includes(item.swapna_id))
        .map(item => item.id);
      filtered = reportAllDonations.filter(d =>
        (d.swapna_id && descendantSwapnaIds.includes(d.swapna_id)) ||
        (d.swapna_item_id && descendantItemIds.includes(d.swapna_item_id))
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

// ========== GET CATEGORY FOR DONATION (walks up to parent if unset) ==========
function getDonationCategory(d) {
  if (d.head_type === 'swapna_item' && d.swapna_item_id) {
    const item = reportSwapnaItems.find(s => s.id === d.swapna_item_id);
    if (item?.category) return item.category;
    const parent = reportSwapnaTree.find(s => s.id === item?.swapna_id);
    if (parent?.category) return parent.category;
    const grandParent = parent ? reportSwapnaTree.find(s => s.id === parent.parent_id) : null;
    if (grandParent?.category) return grandParent.category;
  }
  if (d.head_type === 'swapna' && d.swapna_id) {
    const sw = reportSwapnaTree.find(s => s.id === d.swapna_id);
    if (sw?.category) return sw.category;
    const parent = sw ? reportSwapnaTree.find(s => s.id === sw.parent_id) : null;
    if (parent?.category) return parent.category;
  }
  if (d.head_type === 'general_head' && d.general_head_id) {
    const gh = reportGeneralHeads.find(h => h.id === d.general_head_id);
    if (gh?.category) return gh.category;
    const parent = gh ? reportGeneralHeads.find(h => h.id === gh.parent_id) : null;
    if (parent?.category) return parent.category;
  }
  return null;
}

// A single receipt can bundle donation lines from several different heads/
// categories (one token per visit, not per item) — so a category's or an
// item's total is made up of PORTIONS of possibly several receipts, and one
// receipt number can appear under several different categories/items at
// once. This resolves, per donation line, which printed receipt it belongs
// to (or "Pending" if not printed yet). Split-allocated tokens are a known
// exception: the split names/amounts are divided by person, not by head, so
// there's no single receipt no. to point back to for one line — every split
// receipt for that token is listed instead, without a false per-line split.
function getDonationReceiptInfo(d) {
  if (d.receipt_no) return { label: formatReceiptNo(reportOrgPrefix, d.receipt_no), pending: false };
  if (d._receipt?.receipt_no) return { label: formatReceiptNo(reportOrgPrefix, d._receipt.receipt_no), pending: false };
  if (d.token_id) {
    const t = reportTokenMap[d.token_id];
    if (t) {
      if (t.receipt_no) return { label: formatReceiptNo(reportOrgPrefix, t.receipt_no), pending: false };
      const splits = (reportSplitsByToken[t.id] || []).filter(s => s.receipt_no);
      if (splits.length) {
        return { label: 'Split: ' + splits.map(s => formatReceiptNo(reportOrgPrefix, s.receipt_no)).join(', '), pending: false, isSplit: true };
      }
      return { label: 'Pending print', pending: true };
    }
  }
  return { label: '—', pending: true };
}

function toggleSummaryRow(rowId) {
  expandedSummaryRows[rowId] = !expandedSummaryRows[rowId];
  if (rowId.startsWith('cat-')) renderCategorySummary();
  else renderItemWiseSummary();
}

// Shared renderer for both the 8-category summary and the item-wise summary
// — each row expands in place to list the donations that make up its total,
// with the receipt no. each one was actually printed under.
function renderExpandableSummaryTable(containerId, titleHTML, rows, colLabel) {
  const el = document.getElementById(containerId);
  if (!el) return;
  if (rows.length === 0) { el.innerHTML = ''; return; }

  el.innerHTML = `
    <div class="card">
      <div class="card-title">${titleHTML}</div>
      <div style="overflow-x:auto;">
        <table class="data-table">
          <thead><tr><th style="width:20px;"></th><th>${colLabel}</th><th style="text-align:right;">Entered</th><th style="text-align:right;">Received</th></tr></thead>
          <tbody>
            ${rows.map(r => {
              const isOpen = !!expandedSummaryRows[r.rowId];
              return `
                <tr style="cursor:pointer;" onclick="toggleSummaryRow('${r.rowId}')">
                  <td style="color:var(--text-muted);">${isOpen ? '▾' : '▸'}</td>
                  <td>${r.name}</td>
                  <td style="text-align:right;">₹${r.entered.toLocaleString('en-IN')}</td>
                  <td style="text-align:right;color:#4CAF50;">₹${r.received.toLocaleString('en-IN')}</td>
                </tr>
                ${isOpen ? `
                <tr>
                  <td></td>
                  <td colspan="3" style="padding:0 0 8px 0;">
                    ${r.lines.length === 0 ? `<div style="font-size:12px;color:var(--text-muted);padding:6px 4px;">No donations yet.</div>` : `
                    <table class="data-table" style="width:100%;background:#faf9f7;">
                      <thead><tr><th>Name</th><th style="text-align:right;">Amount</th><th>Receipt No.</th></tr></thead>
                      <tbody>
                        ${r.lines.map(d => {
                          const rec = getDonationReceiptInfo(d);
                          return `<tr>
                            <td style="font-size:12px;">${d.receipt_name || d.donor_name || '—'}</td>
                            <td style="text-align:right;font-size:12px;">₹${parseFloat(d.amount || 0).toLocaleString('en-IN')}</td>
                            <td style="font-size:12px;font-weight:600;${rec.pending ? 'color:#ff9800;' : 'color:var(--primary);'}">${rec.label}</td>
                          </tr>`;
                        }).join('')}
                      </tbody>
                    </table>`}
                  </td>
                </tr>` : ''}
              `;
            }).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

// ========== CATEGORY-WISE SUMMARY (8 fixed categories) ==========
function renderCategorySummary() {
  const CATEGORY_ORDER = DR_CATEGORIES; // shared with Heads Setup — keeps order + Gujarati text in sync

  const byCat = {};
  reportAllDonations.forEach(d => {
    const cat = getDonationCategory(d) || 'Uncategorized';
    if (!byCat[cat]) byCat[cat] = [];
    byCat[cat].push(d);
  });

  const keys = [...CATEGORY_ORDER, ...Object.keys(byCat).filter(k => !CATEGORY_ORDER.includes(k))];
  const rows = keys.map(cat => {
    const lines = byCat[cat] || [];
    return {
      rowId: 'cat-' + cat.replace(/[^a-zA-Z0-9]/g, '_'),
      name: cat,
      entered: lines.reduce((s, d) => s + parseFloat(d.amount || 0), 0),
      received: lines.reduce((s, d) => s + parseFloat(d.received_amount || 0), 0),
      lines
    };
  }).filter(r => r.name !== 'Uncategorized' || r.lines.length > 0);

  renderExpandableSummaryTable('category-summary-container', '📂 Category-wise Summary (8 Khate)', rows, 'Category');
}

// ========== ITEM-WISE SUMMARY (every head/item in the Master List) ==========
function buildMasterItemList() {
  const items = [];

  reportGeneralHeads.forEach(h => {
    const parent = reportGeneralHeads.find(p => p.id === h.parent_id);
    if (parent) return; // only leaf-most level shown as its own row to avoid duplicate parent+child totals
    const children = reportGeneralHeads.filter(c => c.parent_id === h.id);
    if (children.length === 0) {
      items.push({ key: `gh_${h.id}`, name: h.name, match: d => d.head_type === 'general_head' && d.general_head_id === h.id });
    } else {
      children.forEach(c => items.push({ key: `gh_${c.id}`, name: `${h.name} → ${c.name}`, match: d => d.head_type === 'general_head' && d.general_head_id === c.id }));
    }
  });

  reportSwapnaItems.forEach(item => {
    const parent = reportSwapnaTree.find(s => s.id === item.swapna_id);
    const grandParent = parent ? reportSwapnaTree.find(s => s.id === parent.parent_id) : null;
    const name = grandParent ? `${grandParent.name} → ${parent.name} → ${item.name}` : parent ? `${parent.name} → ${item.name}` : item.name;
    items.push({ key: `si_${item.id}`, name, match: d => d.head_type === 'swapna_item' && d.swapna_item_id === item.id });
  });

  // Swapna heads/children that take donations directly (no sub-items under them)
  reportSwapnaTree.forEach(s => {
    const hasChildren = reportSwapnaTree.some(c => c.parent_id === s.id);
    const hasItems = reportSwapnaItems.some(i => i.swapna_id === s.id);
    if (hasChildren || hasItems) return;
    const parent = reportSwapnaTree.find(p => p.id === s.parent_id);
    const name = parent ? `${parent.name} → ${s.name}` : s.name;
    items.push({ key: `sw_${s.id}`, name, match: d => d.head_type === 'swapna' && d.swapna_id === s.id });
  });

  return items;
}

function renderItemWiseSummary() {
  const masterItems = buildMasterItemList();
  const rows = masterItems.map(mi => {
    const lines = reportAllDonations.filter(mi.match);
    return {
      rowId: 'item-' + mi.key,
      name: mi.name,
      entered: lines.reduce((s, d) => s + parseFloat(d.amount || 0), 0),
      received: lines.reduce((s, d) => s + parseFloat(d.received_amount || 0), 0),
      lines
    };
  });

  renderExpandableSummaryTable('item-summary-container', '📋 Item-wise Summary (Master List)', rows, 'Head / Item');
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
              <td><strong>${d.donor_name || '—'}</strong>${d.receipt_name && d.receipt_name !== d.donor_name ? `<div style="font-size:10px;color:var(--text-muted);">Receipt: ${d.receipt_name}</div>` : ''}</td>
              <td style="font-size:12px;">${d.phone || '—'}</td>
              <td style="font-size:12px;">${d.family_no || '—'}</td>
              <td style="font-size:11px;max-width:200px;word-break:break-word;">${headName}</td>
              <td><strong>₹${parseFloat(d.amount || 0).toLocaleString('en-IN')}</strong>${d.mun_qty ? `<div style="font-size:11px;color:var(--text-muted);">${d.mun_qty} mun</div>` : ''}</td>
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
  const { error } = await db.from('dr_donations')
    .update({ received_amount: amount })
    .eq('id', donationId)
    .eq('org_id', currentOrgId);

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
  const isPending = getDonationStatus(d).label === 'PENDING';
  const msg = isPending
    ? `🛕 *Derasar Boli - Pending Donation*\n\n` +
      `👤 Donor: ${d.donor_name || '—'}\n` +
      `🏠 Family No: ${d.family_no || '—'}\n` +
      `📋 Head: ${headName}\n` +
      `💰 Amount Pledged: ₹${parseFloat(d.amount || 0).toLocaleString('en-IN')}${d.mun_qty ? ' (' + d.mun_qty + ' mun)' : ''}\n` +
      `⏳ Payment Pending — kindly complete at your earliest convenience.\n\n` +
      `🙏 Jai Jinendra`
    : `🛕 *Derasar Boli - Donation Confirmation*\n\n` +
      `👤 Donor: ${d.donor_name || '—'}\n` +
      `🏠 Family No: ${d.family_no || '—'}\n` +
      `📋 Head: ${headName}\n` +
      `💰 Amount: ₹${parseFloat(d.amount || 0).toLocaleString('en-IN')}${d.mun_qty ? ' (' + d.mun_qty + ' mun)' : ''}\n` +
      `✅ Payment Received\n\n` +
      `🙏 Jai Jinendra`;

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

  // Helper: style cells
  const headerStyle = { font: { bold: true, color: { rgb: 'FFFFFF' } }, fill: { fgColor: { rgb: '7B3F00' } }, alignment: { horizontal: 'center' } };
  const totalStyle  = { font: { bold: true }, fill: { fgColor: { rgb: 'FFF4E0' } } };
  const lockedStyle = { fill: { fgColor: { rgb: 'EEEEEE' } }, protection: { locked: true } };

  // Helper: build a head sheet and return { sheetName, entered, received, pending, verified, mismatch }
  function buildHeadSheet(wb, sheetLabel, donations) {
    const rows = [
      ['#', 'Donor Name', 'Phone', 'Family No', 'Head / Sub-head', 'Amt Entered (₹)', 'Amt Received (₹)\n[Enter in App only]', 'Status', 'Receipt No', 'Mun Qty']
    ];
    donations.forEach((d, i) => {
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
        receiptNo,
        d.mun_qty || ''
      ]);
    });

    const entered  = donations.reduce((s, d) => s + parseFloat(d.amount || 0), 0);
    const received = donations.reduce((s, d) => s + parseFloat(d.received_amount || 0), 0);
    const pending  = donations.filter(d => !d.received_amount && d.received_amount !== 0).length;
    const verified = donations.filter(d => d.received_amount && parseFloat(d.received_amount) === parseFloat(d.amount) && d.receipt_id).length;
    const mismatch = donations.filter(d => d.received_amount && parseFloat(d.received_amount) !== parseFloat(d.amount)).length;

    if (donations.length > 0) {
      rows.push([]);
      rows.push(['', 'TOTAL', '', '', '', entered, received, '', '', '']);
    }

    const safeName = sheetLabel.substring(0, 28).replace(/[\\\/\?\*\[\]]/g, '').trim() || 'Sheet';
    const ws = XLSX.utils.aoa_to_sheet(rows);
    ws['!cols'] = [{wch:4},{wch:22},{wch:13},{wch:10},{wch:42},{wch:16},{wch:20},{wch:12},{wch:14},{wch:10}];

    // Mark Amt Received column (col G = index 6) as grey/locked visually
    const range = XLSX.utils.decode_range(ws['!ref'] || 'A1');
    for (let R = 1; R <= range.e.r; R++) {
      const cellAddr = XLSX.utils.encode_cell({ r: R, c: 6 });
      if (ws[cellAddr]) {
        ws[cellAddr].s = lockedStyle;
      }
    }

    XLSX.utils.book_append_sheet(wb, ws, safeName);
    return { sheetName: safeName, entered, received, pending, verified, mismatch };
  }

  // ---- Build all head sheets and collect index data ----
  const indexRows = [];

  // Swapna heads
  const mainSwapnaHeads = reportSwapnaTree.filter(s => !s.parent_id).sort((a,b) => (a.sort_order||0)-(b.sort_order||0));
  mainSwapnaHeads.forEach(mainHead => {
    const descendantSwapnaIds = getSwapnaDescendants(mainHead.id);
    const descendantItemIds = reportSwapnaItems
      .filter(item => descendantSwapnaIds.includes(item.swapna_id))
      .map(item => item.id);
    const filtered = reportAllDonations.filter(d =>
      (d.swapna_id && descendantSwapnaIds.includes(d.swapna_id)) ||
      (d.swapna_item_id && descendantItemIds.includes(d.swapna_item_id))
    );
    const result = buildHeadSheet(wb, mainHead.name, filtered);
    indexRows.push(result);
  });

  // General heads
  const mainGeneralHeads = reportGeneralHeads.filter(h => !h.parent_id).sort((a,b) => (a.display_order||0)-(b.display_order||0));
  mainGeneralHeads.forEach(mainHead => {
    const subIds = reportGeneralHeads
      .filter(h => h.parent_id === mainHead.id || h.id === mainHead.id)
      .map(h => h.id);
    const filtered = reportAllDonations.filter(d =>
      d.general_head_id && subIds.includes(d.general_head_id)
    );
    if (filtered.length === 0) return;
    const label = 'Gen - ' + mainHead.name;
    const result = buildHeadSheet(wb, label, filtered);
    indexRows.push(result);
  });

  // Category sheets (a donation's category, or "Uncategorized" if its head has none set)
  DR_CATEGORIES.concat(['Uncategorized']).forEach(cat => {
    const filtered = reportAllDonations.filter(d => (getDonationCategory(d) || 'Uncategorized') === cat);
    if (filtered.length === 0) return;
    const result = buildHeadSheet(wb, 'Cat - ' + cat, filtered);
    indexRows.push(result);
  });

  // ---- All Donations Sheet ----
  const allRows = [
    ['#', 'Donor Name', 'Phone', 'Family No', 'Head Type', 'Head / Sub-head', 'Amt Entered (₹)', 'Amt Received (₹)\n[Enter in App only]', 'Status', 'Receipt No', 'Date', 'Mun Qty']
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
      new Date(d.created_at).toLocaleDateString('en-IN'),
      d.mun_qty || ''
    ]);
  });
  // Total row
  allRows.push([]);
  allRows.push(['', 'GRAND TOTAL', '', '', '', '',
    reportAllDonations.reduce((s,d) => s + parseFloat(d.amount||0), 0),
    reportAllDonations.reduce((s,d) => s + parseFloat(d.received_amount||0), 0),
    '', '', '', ''
  ]);

  const allWs = XLSX.utils.aoa_to_sheet(allRows);
  allWs['!cols'] = [{wch:4},{wch:22},{wch:13},{wch:10},{wch:10},{wch:42},{wch:16},{wch:20},{wch:12},{wch:14},{wch:12},{wch:10}];
  // Grey out Amt Received col (col H = index 7)
  const allRange = XLSX.utils.decode_range(allWs['!ref'] || 'A1');
  for (let R = 1; R <= allRange.e.r; R++) {
    const cellAddr = XLSX.utils.encode_cell({ r: R, c: 7 });
    if (allWs[cellAddr]) allWs[cellAddr].s = lockedStyle;
  }
  XLSX.utils.book_append_sheet(wb, allWs, 'All Donations');

  // ---- INDEX Sheet (first sheet) ----
  const totalEntered  = reportAllDonations.reduce((s,d) => s + parseFloat(d.amount||0), 0);
  const totalReceived = reportAllDonations.reduce((s,d) => s + parseFloat(d.received_amount||0), 0);
  const totalPending  = reportAllDonations.filter(d => !d.received_amount && d.received_amount !== 0).length;
  const totalVerified = reportAllDonations.filter(d => d.received_amount && parseFloat(d.received_amount) === parseFloat(d.amount) && d.receipt_id).length;
  const totalMismatch = reportAllDonations.filter(d => d.received_amount && parseFloat(d.received_amount) !== parseFloat(d.amount)).length;

  const eventSelect = document.getElementById('report-event-select');
  const eventName = eventSelect ? eventSelect.options[eventSelect.selectedIndex]?.text || 'Paryushan 2026' : 'Paryushan 2026';

  const idxData = [
    ['🛕 Derasar Boli - ' + eventName],
    ['Generated on: ' + new Date().toLocaleString('en-IN')],
    ['⚠️ Amt Received column is READ ONLY — Enter amounts in the App only'],
    [],
    ['', 'Head Name', 'Amt Entered (₹)', 'Amt Received (₹)', 'Pending', 'Verified', 'Mismatch', 'Click to Open'],
  ];

  indexRows.forEach((row, i) => {
    idxData.push([
      i + 1,
      row.sheetName,
      row.entered,
      row.received,
      row.pending,
      row.verified,
      row.mismatch,
      { f: `HYPERLINK("#'${row.sheetName}'!A1","→ Go to Sheet")` }
    ]);
  });

  // Also add All Donations link
  idxData.push([
    '',
    'ALL DONATIONS (Full List)',
    totalEntered,
    totalReceived,
    totalPending,
    totalVerified,
    totalMismatch,
    { f: `HYPERLINK("#'All Donations'!A1","→ Go to Sheet")` }
  ]);

  idxData.push([]);
  idxData.push(['', 'GRAND TOTAL', totalEntered, totalReceived, totalPending, totalVerified, totalMismatch, '']);

  const idxWs = XLSX.utils.aoa_to_sheet(idxData);
  idxWs['!cols'] = [{wch:4},{wch:42},{wch:16},{wch:16},{wch:10},{wch:10},{wch:10},{wch:16}];

  // Insert Index as FIRST sheet
  wb.SheetNames.unshift('Index');
  wb.Sheets['Index'] = idxWs;

  // Download
  const fileName = `DerasarBoli_${eventName.replace(/\s+/g,'_')}_${new Date().toISOString().slice(0,10)}.xlsx`;
  XLSX.writeFile(wb, fileName);
  showToast('✅ Excel downloaded!', 'success');
}

// ==========================================
// RECEIPT REGISTER — date-range audit list across every issued receipt
// (dr_receipt_tokens combined receipts, dr_token_splits split-name
// receipts, and any legacy dr_donations single-line receipts), all
// sharing one numbering sequence, sorted by receipt number so a missing
// or duplicated number is immediately visible.
// ==========================================

function receiptRegisterSectionHTML() {
  return `
    <div class="card">
      <div class="card-title">🧾 Receipt Register</div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:flex-end;margin-bottom:10px;">
        <div class="form-group" style="margin-bottom:0;">
          <label>From</label>
          <input type="date" id="register-from" />
        </div>
        <div class="form-group" style="margin-bottom:0;">
          <label>To</label>
          <input type="date" id="register-to" />
        </div>
        <button class="btn-primary btn-sm" onclick="loadReceiptRegister()">Load</button>
        <button class="btn-sm btn-secondary" onclick="downloadReceiptRegisterExcel()">⬇️ Excel</button>
        <button class="btn-sm btn-secondary" onclick="printReceiptRegister()">🖨 Print All</button>
      </div>
      <div id="register-table-container"><p style="color:var(--text-muted);font-size:13px;">Pick a date range and click Load.</p></div>
    </div>
  `;
}

function initReceiptRegisterDates() {
  const fromEl = document.getElementById('register-from');
  const toEl = document.getElementById('register-to');
  if (!fromEl || !toEl || fromEl.value) return; // don't clobber a range the admin already picked
  const today = new Date().toISOString().slice(0, 10);
  fromEl.value = today;
  toEl.value = today;
}

async function loadReceiptRegister() {
  const fromDate = document.getElementById('register-from')?.value;
  const toDate = document.getElementById('register-to')?.value;
  if (!fromDate || !toDate) { showToast('Select a from and to date', 'error'); return; }

  const fromTs = new Date(fromDate + 'T00:00:00').toISOString();
  const toTs = new Date(toDate + 'T23:59:59.999').toISOString();

  const [{ data: tokens }, { data: splits }, { data: donations }] = await Promise.all([
    db.from('dr_receipt_tokens').select('id, receipt_no, receipt_no_assigned_at, payer_name, total_amount')
      .eq('org_id', currentOrgId).not('receipt_no', 'is', null)
      .gte('receipt_no_assigned_at', fromTs).lte('receipt_no_assigned_at', toTs),
    db.from('dr_token_splits').select('id, receipt_no, receipt_no_assigned_at, name, amount')
      .eq('org_id', currentOrgId).not('receipt_no', 'is', null)
      .gte('receipt_no_assigned_at', fromTs).lte('receipt_no_assigned_at', toTs),
    db.from('dr_donations').select('id, receipt_no, receipt_no_assigned_at, donor_name, receipt_name, amount')
      .eq('org_id', currentOrgId).not('receipt_no', 'is', null)
      .gte('receipt_no_assigned_at', fromTs).lte('receipt_no_assigned_at', toTs)
  ]);

  registerRows = [
    ...(tokens || []).map(t => ({ receiptNo: t.receipt_no, date: t.receipt_no_assigned_at, name: t.payer_name, amount: parseFloat(t.total_amount), source: 'Token', sourceId: t.id })),
    ...(splits || []).map(s => ({ receiptNo: s.receipt_no, date: s.receipt_no_assigned_at, name: s.name, amount: parseFloat(s.amount), source: 'Split', sourceId: s.id })),
    ...(donations || []).map(d => ({ receiptNo: d.receipt_no, date: d.receipt_no_assigned_at, name: d.receipt_name || d.donor_name, amount: parseFloat(d.amount), source: 'Donation', sourceId: d.id }))
  ].sort((a, b) => a.receiptNo - b.receiptNo);

  renderReceiptRegisterTable();
}

function renderReceiptRegisterTable() {
  const el = document.getElementById('register-table-container');
  if (!el) return;

  if (registerRows.length === 0) {
    el.innerHTML = `<p style="color:var(--text-muted);font-size:13px;">No receipts in this range.</p>`;
    return;
  }

  let gapWarning = '';
  for (let i = 1; i < registerRows.length; i++) {
    if (registerRows[i].receiptNo !== registerRows[i - 1].receiptNo + 1) {
      gapWarning = `<p style="color:var(--danger);font-size:12px;font-weight:600;margin-bottom:8px;">⚠ Gap in sequence: #${registerRows[i - 1].receiptNo} → #${registerRows[i].receiptNo}</p>`;
      break;
    }
  }

  const total = registerRows.reduce((s, r) => s + r.amount, 0);

  el.innerHTML = `
    ${gapWarning}
    <div style="overflow-x:auto;">
      <table class="data-table">
        <thead><tr><th>Receipt No.</th><th>Date</th><th>Name</th><th>Amount</th><th>Source</th><th>Actions</th></tr></thead>
        <tbody>
          ${registerRows.map(r => `
            <tr>
              <td><strong>${r.receiptNo}</strong></td>
              <td style="font-size:12px;">${new Date(r.date).toLocaleDateString('en-IN')}</td>
              <td>${r.name}</td>
              <td>${formatAmount(r.amount)}</td>
              <td style="font-size:11px;color:var(--text-muted);">${r.source}</td>
              <td><button class="btn-sm btn-secondary" onclick="reprintRegisterRow('${r.source}','${r.sourceId}')">🖨</button></td>
            </tr>
          `).join('')}
        </tbody>
        <tfoot><tr style="font-weight:700;"><td colspan="3">${registerRows.length} receipts</td><td>${formatAmount(total)}</td><td colspan="2"></td></tr></tfoot>
      </table>
    </div>
  `;
}

function reprintRegisterRow(source, id) {
  if (source === 'Token') showCombinedTokenReceipt(id);
  else if (source === 'Split') showSplitReceipt(id);
  else showDonationReceipt(id);
}

function downloadReceiptRegisterExcel() {
  if (registerRows.length === 0) { showToast('Load the register first', 'error'); return; }
  if (typeof XLSX === 'undefined') { showToast('Excel library not loaded. Check internet connection.', 'error'); return; }

  const rows = [['Receipt No.', 'Date', 'Name', 'Amount (₹)', 'Source']];
  registerRows.forEach(r => rows.push([r.receiptNo, new Date(r.date).toLocaleDateString('en-IN'), r.name, r.amount, r.source]));
  rows.push([]);
  rows.push(['', 'TOTAL', '', registerRows.reduce((s, r) => s + r.amount, 0), '']);

  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!cols'] = [{ wch: 12 }, { wch: 12 }, { wch: 28 }, { wch: 14 }, { wch: 10 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Receipt Register');

  const fromDate = document.getElementById('register-from')?.value || '';
  const toDate = document.getElementById('register-to')?.value || '';
  XLSX.writeFile(wb, `Receipt_Register_${fromDate}_to_${toDate}.xlsx`);
  showToast('✅ Excel downloaded!', 'success');
}

// A clean tabular printout for the physical audit file — not each receipt
// re-rendered in full branded format (that's already one click away per row
// via the 🖨 reprint button), just the register itself as a signable list.
function printReceiptRegister() {
  if (registerRows.length === 0) { showToast('Load the register first', 'error'); return; }

  const fromDate = document.getElementById('register-from')?.value || '';
  const toDate = document.getElementById('register-to')?.value || '';
  const total = registerRows.reduce((s, r) => s + r.amount, 0);

  const rowsHtml = registerRows.map(r => `
    <tr>
      <td>${r.receiptNo}</td>
      <td>${new Date(r.date).toLocaleDateString('en-IN')}</td>
      <td>${r.name}</td>
      <td style="text-align:right;">₹${r.amount.toLocaleString('en-IN')}</td>
      <td>${r.source}</td>
    </tr>`).join('');

  const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8"/>
<title>Receipt Register ${fromDate} to ${toDate}</title>
<style>
  body{font-family:Arial,sans-serif;padding:20px;color:#222;}
  h2{margin-bottom:2px;}
  table{width:100%;border-collapse:collapse;margin-top:14px;}
  th,td{border:1px solid #999;padding:6px 8px;font-size:12px;text-align:left;}
  th{background:#7B1E3B;color:#fff;}
  tfoot td{font-weight:700;background:#f5f5f5;}
  .btn{margin-top:20px;padding:10px 18px;border:none;border-radius:8px;background:#7B1E3B;color:#fff;font-size:13px;cursor:pointer;}
  @media print{ @page{size:A4;margin:12mm;} .btn{display:none;} }
</style>
</head>
<body>
  <h2>Receipt Register</h2>
  <div style="font-size:12px;color:#555;">${fromDate} to ${toDate} — ${registerRows.length} receipts</div>
  <table>
    <thead><tr><th>Receipt No.</th><th>Date</th><th>Name</th><th>Amount</th><th>Source</th></tr></thead>
    <tbody>${rowsHtml}</tbody>
    <tfoot><tr><td colspan="3">Total</td><td style="text-align:right;">₹${total.toLocaleString('en-IN')}</td><td></td></tr></tfoot>
  </table>
  <button class="btn" onclick="window.print()">🖨 Print</button>
</body>
</html>`;

  const win = window.open('', '_blank', 'width=800,height=900,scrollbars=yes');
  if (!win) { showToast('Allow pop-ups to view the register', 'error'); return; }
  win.document.write(html);
  win.document.close();
}
