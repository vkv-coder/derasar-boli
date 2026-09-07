// ==========================================
// DERASAR BOLI - Heads Setup
// ==========================================

let expandedGeneralHeads = {};  // track which general heads are expanded
let orgBoliUnitMode = 'rupees';
let orgRatePerMun = null;
let orgRatePerAani = 1800;
let orgSplitThreshold = 20000;
let masterListGeneralHeads = [];  // cached for the Master List "+ Add" modal
let masterListSwapnaHeads = [];
let masterListEvents = [];
let masterListRows = [];  // cached for the print-out

const DR_CATEGORIES = [
  'સાધારણ ખાતે', 'જ્ઞાન ખાતે', 'જીવદયા ખાતે', 'દેવદ્રવ્ય ખાતે',
  'વૈયાવચ્ચ ખાતે', 'દેવદ્રવ્ય કાયમી ફંડ ખાતે', 'દેરાસર નિભાવણી ખાતે',
  'સાધારણ કાયમી ફંડ ખાતે'
];

async function renderHeads() {
  const content = document.getElementById('page-content');
  const { data: orgData } = await db.from('dr_organizations').select('boli_unit_mode, rate_per_mun, rate_per_aani, split_receipt_threshold').eq('id', currentOrgId).single();

  orgBoliUnitMode = orgData?.boli_unit_mode || 'rupees';
  orgRatePerMun = orgData?.rate_per_mun ?? null;
  orgRatePerAani = orgData?.rate_per_aani ?? 1800;
  orgSplitThreshold = orgData?.split_receipt_threshold ?? 20000;

  content.innerHTML = `
    <div class="card">
      <div class="card-title">⚖️ Boli Unit Setup</div>
      <div class="form-group">
        <label>How is boli (bid) spoken in your Sangh?</label>
        <select id="boli-unit-mode-select" onchange="onBoliUnitModeChange()">
          <option value="rupees" ${orgBoliUnitMode === 'rupees' ? 'selected' : ''}>₹ All Rupees</option>
          <option value="mun" ${orgBoliUnitMode === 'mun' ? 'selected' : ''}>All in Mun</option>
          <option value="aani" ${orgBoliUnitMode === 'aani' ? 'selected' : ''}>All in Aani</option>
          <option value="mixed" ${orgBoliUnitMode === 'mixed' ? 'selected' : ''}>Mixed (set per head below, using ⚙)</option>
        </select>
      </div>
      <div class="form-group" id="boli-rate-mun-group" style="display:${orgBoliUnitMode === 'mun' || orgBoliUnitMode === 'mixed' ? 'block' : 'none'};">
        <label>Rate (₹ per Mun) — one fixed rate for your whole Sangh</label>
        <input type="number" id="boli-rate-input" value="${orgRatePerMun ?? ''}" placeholder="e.g. 5000" min="0" />
      </div>
      <div class="form-group" id="boli-rate-aani-group" style="display:${orgBoliUnitMode === 'aani' || orgBoliUnitMode === 'mixed' ? 'block' : 'none'};">
        <label>Rate (₹ per Aani) — one fixed rate for your whole Sangh</label>
        <input type="number" id="aani-rate-input" value="${orgRatePerAani ?? ''}" placeholder="e.g. 1800" min="0" />
      </div>
      <div class="form-group">
        <label>Split-Receipt Threshold (₹) — donations at/above this amount get the option to split the receipt across multiple names</label>
        <input type="number" id="split-threshold-input" value="${orgSplitThreshold ?? 20000}" placeholder="e.g. 20000" min="0" />
      </div>
      <button class="btn-primary btn-sm" onclick="saveBoliUnitMode()">Save</button>
      ${orgBoliUnitMode === 'mixed' ? `<p style="font-size:12px;color:var(--text-muted);margin-top:8px;">Set a head's Unit (Rupees/Mun/Aani) from the Master List below — everything beneath a head follows its unit, unless you override a lower level too.</p>` : ''}
    </div>
    <div class="card">
      <div class="section-header">
        <h3>📋 Master List — Category &amp; Unit</h3>
        <div style="display:flex;gap:8px;">
          <button class="btn-sm btn-secondary" onclick="downloadMasterListExcel()">⬇ Excel</button>
          <button class="btn-sm btn-secondary" onclick="printMasterList()">🖨 Print</button>
          <button class="btn-accent btn-sm" onclick="showMasterAddModal()">+ Add</button>
        </div>
      </div>
      <p style="font-size:12px;color:var(--text-muted);margin-bottom:10px;">Every donation head/item (General &amp; Paryushan, across all events) in one place. Admin-only. Changing a dropdown saves immediately.</p>
      <div id="master-heads-list">Loading...</div>
    </div>
    <div class="card">
      <div class="section-header">
        <h3>🎟 Functions / Event Entry</h3>
        <button class="btn-accent btn-sm" onclick="showAddFunctionModal()">+ Add Function</button>
      </div>
      <p style="font-size:12px;color:var(--text-muted);margin-bottom:10px;">Upcoming functions only — past ones drop off this list automatically. Set pass counts per family from the Members tab (🎟) or when scanning their Membership Card.</p>
      <div id="functions-list">Loading...</div>
    </div>
    <div class="card">
      <div class="section-header">
        <h3>🔷 Main Donation Heads</h3>
      </div>
      <div id="general-heads-list">Loading...</div>
    </div>
  `;
  await Promise.all([loadGeneralHeadsList(), loadFunctionsList(), loadMasterHeadsList()]);
}

// ========== MASTER LIST — every head/item, one flat table, 3 dropdowns each ==========
async function loadMasterHeadsList() {
  const el = document.getElementById('master-heads-list');
  if (!el) return;

  const [{ data: generalHeads }, { data: swapnaHeads }, { data: swapnaItems }, { data: events }] = await Promise.all([
    db.from('dr_general_heads').select('*').eq('org_id', currentOrgId).order('display_order'),
    db.from('dr_swapna').select('*').eq('org_id', currentOrgId).order('sort_order'),
    db.from('dr_swapna_items').select('*').eq('org_id', currentOrgId).order('sort_order'),
    db.from('dr_events').select('id, name').eq('org_id', currentOrgId)
  ]);

  const eventById = {};
  (events || []).forEach(e => { eventById[e.id] = e.name; });
  const swById = {};
  (swapnaHeads || []).forEach(h => { swById[h.id] = h; });

  // Cached for the "+ Add" modal so it doesn't need to refetch.
  masterListGeneralHeads = generalHeads || [];
  masterListSwapnaHeads = swapnaHeads || [];
  masterListEvents = events || [];

  const rows = [];

  // Category-grouped ordering across BOTH tables together (not general-heads-
  // block-then-swapna-block) — otherwise an item like "આંગી" ends up sandwiched
  // between two separate same-category blocks (general's સાધારણ ખાતે items,
  // then swapna's own સાધારણ ખાતે items) instead of one clean group. Ashtamangal
  // items always come first regardless of their category's normal rank.
  const catRank = {};
  DR_CATEGORIES.forEach((c, i) => { catRank[c] = i; });
  function topSortKey(category, name) {
    const isAstamangal = name.includes('(અષ્ટમંગલ)');
    const rank = catRank.hasOwnProperty(category) ? catRank[category] : DR_CATEGORIES.length;
    return (isAstamangal ? -1 : rank);
  }

  const topEntries = [];

  (generalHeads || []).forEach(h => {
    if (!h.parent_id && DR_CATEGORIES.includes(h.name)) return; // one of the 8 main heads — already shown in Main Donation Heads above, no need to repeat here
    topEntries.push({ kind: 'general', head: h, key: topSortKey(h.category, h.name) });
  });

  // Depth-first: a head is immediately followed by its own items, then its
  // sub-heads (each followed by their items, and so on) — so e.g. "1st
  // Swapna" is followed right away by its Sona Mala / Ful Mala offerings
  // before "2nd Swapna" starts, instead of every head first and every item
  // afterward in two separate blocks (which scrambled the natural grouping
  // whenever items shared the same sort_order across different heads).
  const swapnaChildrenByParent = {};
  (swapnaHeads || []).forEach(h => {
    const key = h.parent_id || '__root__';
    if (!swapnaChildrenByParent[key]) swapnaChildrenByParent[key] = [];
    swapnaChildrenByParent[key].push(h);
  });
  Object.values(swapnaChildrenByParent).forEach(list => list.sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0)));

  const swapnaItemsByHead = {};
  (swapnaItems || []).forEach(item => {
    if (!swapnaItemsByHead[item.swapna_id]) swapnaItemsByHead[item.swapna_id] = [];
    swapnaItemsByHead[item.swapna_id].push(item);
  });
  Object.values(swapnaItemsByHead).forEach(list => list.sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0)));

  function swapnaPath(h) {
    const parent = h.parent_id ? swById[h.parent_id] : null;
    const grandParent = parent && parent.parent_id ? swById[parent.parent_id] : null;
    return [grandParent?.name, parent?.name, h.name].filter(Boolean).join(' → ');
  }

  function walkSwapna(h) {
    const path = swapnaPath(h);
    rows.push({
      table: 'dr_swapna', id: h.id, bareName: h.name,
      name: path + (eventById[h.event_id] ? ` (${eventById[h.event_id]})` : ''),
      type: 'Paryushan',
      category: h.category, unit_mode: h.unit_mode, pricing_type: h.pricing_type
    });
    (swapnaItemsByHead[h.id] || []).forEach(item => {
      rows.push({
        table: 'dr_swapna_items', id: item.id, bareName: item.name,
        name: (path ? path + ' → ' : '') + item.name + (eventById[h.event_id] ? ` (${eventById[h.event_id]})` : ''),
        type: 'Paryushan',
        category: item.category, unit_mode: item.unit_mode, pricing_type: item.pricing_type
      });
    });
    (swapnaChildrenByParent[h.id] || []).forEach(child => walkSwapna(child));
  }

  (swapnaChildrenByParent['__root__'] || []).forEach(h => {
    topEntries.push({ kind: 'swapna', head: h, key: topSortKey(h.category, h.name) });
  });

  // Stable sort keeps each entry's original relative order (which already
  // reflects display_order / sort_order) whenever two entries land on the
  // same category — only the category grouping itself changes.
  topEntries.sort((a, b) => a.key - b.key);
  topEntries.forEach(entry => {
    if (entry.kind === 'general') {
      const h = entry.head;
      // No "Main Head → " prefix here — every remaining general row is a
      // sub-head of exactly one of the 8 mains now, so the Category column
      // already says which; the name itself stays just its own bare name
      // (matching what the rename box shows).
      rows.push({
        table: 'dr_general_heads', id: h.id, bareName: h.name,
        name: h.name,
        type: 'General',
        category: h.category, unit_mode: h.unit_mode, pricing_type: h.pricing_type
      });
    } else {
      walkSwapna(entry.head);
    }
  });

  masterListRows = rows; // cached for the print-out

  if (rows.length === 0) {
    el.innerHTML = `<p style="color:var(--text-muted);font-size:13px;">No items yet — add heads below first.</p>`;
    return;
  }

  el.innerHTML = `
    <div style="overflow-x:auto;">
      <table class="data-table" style="min-width:640px;">
        <thead><tr><th>#</th><th>Name</th><th>Type</th><th>Category</th><th>Unit</th><th></th></tr></thead>
        <tbody>
          ${rows.map((r, i) => `
            <tr>
              <td style="font-size:11px;color:var(--text-muted);">${i + 1}</td>
              <td style="font-size:12px;max-width:260px;word-break:break-word;">${r.name}</td>
              <td style="font-size:11px;color:var(--text-muted);">${r.type}</td>
              <td>
                <select onchange="saveMasterField('${r.table}','${r.id}','category',this.value)">
                  <option value="">-- Uncategorized --</option>
                  ${DR_CATEGORIES.map(c => `<option value="${c}" ${r.category === c ? 'selected' : ''}>${c}</option>`).join('')}
                </select>
              </td>
              <td>
                <select onchange="saveMasterField('${r.table}','${r.id}','unit_mode',this.value)">
                  <option value="" ${!r.unit_mode ? 'selected' : ''}>Inherit</option>
                  <option value="rupees" ${r.unit_mode === 'rupees' ? 'selected' : ''}>₹ Rupees</option>
                  <option value="mun" ${r.unit_mode === 'mun' ? 'selected' : ''}>Mun</option>
                  <option value="aani" ${r.unit_mode === 'aani' ? 'selected' : ''}>Aani</option>
                </select>
              </td>
              <td>
                <div style="display:flex;gap:4px;">
                  <button class="btn-sm btn-secondary" onclick="showMasterRenameModal('${r.table}','${r.id}','${r.bareName.replace(/'/g,"\\'")}')">✎</button>
                  <button class="btn-sm btn-danger" onclick="deleteMasterRow('${r.table}','${r.id}','${r.bareName.replace(/'/g,"\\'")}')">🗑</button>
                </div>
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;
}

function downloadMasterListExcel() {
  if (typeof XLSX === 'undefined') {
    showToast('Excel library not loaded. Check internet connection.', 'error');
    return;
  }

  const rows = [
    ['Sr No', 'Name', 'Type', 'Category']
  ];
  masterListRows.forEach((r, i) => {
    rows.push([i + 1, r.name, r.type, r.category || '']);
  });

  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!cols'] = [{ wch: 6 }, { wch: 60 }, { wch: 10 }, { wch: 24 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Master List');

  const dateStr = new Date().toLocaleDateString('en-IN').replace(/\//g, '-');
  XLSX.writeFile(wb, `Master_List_${dateStr}.xlsx`);
  showToast('✅ Excel downloaded!', 'success');
}

// Clean tabular printout for physical record-keeping — includes the 8 Main
// Donation Heads too (excluded from the on-screen list to avoid repeating
// what's already shown in that section) so this is a complete category
// audit sheet, not just the sub-items.
function printMasterList() {
  const mainHeads = masterListGeneralHeads
    .filter(h => !h.parent_id && DR_CATEGORIES.includes(h.name))
    .sort((a, b) => (a.display_order || 0) - (b.display_order || 0));

  const dateStr = new Date().toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' });

  const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8"/>
<title>Master List — ${dateStr}</title>
<style>
  *{box-sizing:border-box;font-family:Arial,sans-serif;}
  body{margin:0;padding:20px;}
  h1{font-size:18px;margin:0 0 4px;}
  h2{font-size:14px;margin:20px 0 6px;padding-top:10px;border-top:2px solid #333;}
  h2:first-of-type{border-top:none;padding-top:0;margin-top:10px;}
  .sub{font-size:12px;color:#666;margin-bottom:6px;}
  table{width:100%;border-collapse:collapse;font-size:12px;}
  th,td{border:1px solid #ccc;padding:5px 8px;text-align:left;}
  th{background:#f0f0f0;}
  td:first-child,th:first-child{text-align:center;width:36px;}
  @media print{
    @page{size:A4;margin:14mm;}
    body{padding:0;}
  }
</style>
</head>
<body>
  <h1>Master List — Category &amp; Unit</h1>
  <div class="sub">Printed ${dateStr}</div>

  <h2>Main Donation Heads (8)</h2>
  <table>
    <thead><tr><th>#</th><th>Name</th><th>Category</th><th>Unit</th></tr></thead>
    <tbody>
      ${mainHeads.map((h, i) => `
        <tr>
          <td>${i + 1}</td>
          <td>${h.name}</td>
          <td>${h.category || '—'}</td>
          <td>${h.unit_mode || 'rupees'}</td>
        </tr>
      `).join('')}
    </tbody>
  </table>

  <h2>Master List</h2>
  <table>
    <thead><tr><th>#</th><th>Name</th><th>Type</th><th>Category</th><th>Unit</th></tr></thead>
    <tbody>
      ${masterListRows.map((r, i) => `
        <tr>
          <td>${i + 1}</td>
          <td>${r.name}</td>
          <td>${r.type}</td>
          <td>${r.category || '—'}</td>
          <td>${r.unit_mode || 'Inherit'}</td>
        </tr>
      `).join('')}
    </tbody>
  </table>
  <script>window.onload = () => window.print();</script>
</body>
</html>`;

  const win = window.open('', '_blank');
  if (!win) { showToast('Allow pop-ups to print', 'error'); return; }
  win.document.write(html);
  win.document.close();
}

function showMasterRenameModal(table, id, name) {
  showModal(`
    <div class="modal-title">Rename</div>
    <div class="form-group">
      <label>Name</label>
      <input type="text" id="mren-name" value="${name}" />
    </div>
    <div class="modal-actions">
      <button class="btn-primary" onclick="saveMasterRename('${table}','${id}')">Save</button>
      <button class="btn-secondary" onclick="closeModal()">Cancel</button>
    </div>
  `);
}

async function saveMasterRename(table, id) {
  const name = document.getElementById('mren-name').value.trim();
  if (!name) { showToast('Enter a name', 'error'); return; }
  const { error } = await db.from(table).update({ name }).eq('id', id);
  if (error) { showToast('Error: ' + error.message, 'error'); return; }
  closeModal();
  showToast('Renamed!', 'success');
  await loadMasterHeadsList();
  await loadGeneralHeadsList();
}

// Deleting a row never deletes its children — if it has sub-heads under it,
// those get disconnected (promoted to independent top-level items) first,
// then just the one row you asked for is removed. No cascade, no need to
// manually clear children out first.
async function deleteMasterRow(table, id, name) {
  let childHeadCount = 0;
  let childItemCount = 0;
  if (table === 'dr_general_heads' || table === 'dr_swapna') {
    const { count, error: cErr } = await db.from(table).select('id', { count: 'exact', head: true }).eq('parent_id', id);
    if (cErr) { showToast('Error: ' + cErr.message, 'error'); return; }
    childHeadCount = count || 0;
  }
  // A dr_swapna row (e.g. "1st Swapna") can also have dr_swapna_items
  // attached via swapna_id — a completely different link than parent_id,
  // and one the DB itself cascade-deletes when the parent goes. Those
  // items have no safe "independent" display today, so unlike sub-heads
  // (which get auto-disconnected below), items block the delete outright.
  if (table === 'dr_swapna') {
    const { count, error: iErr } = await db.from('dr_swapna_items').select('id', { count: 'exact', head: true }).eq('swapna_id', id);
    if (iErr) { showToast('Error: ' + iErr.message, 'error'); return; }
    childItemCount = count || 0;
  }

  if (childItemCount > 0) {
    showToast(`Can't delete "${name}" — it still has ${childItemCount} item(s) (like Sona Mala/Ful Mala) attached. Delete or reassign those first.`, 'error');
    return;
  }

  const warn = childHeadCount > 0
    ? `Delete "${name}"? It has ${childHeadCount} sub-item(s) — they'll be kept as independent items, not deleted. This cannot be undone.`
    : `Delete "${name}"? This cannot be undone.`;
  if (!confirm(warn)) return;

  if (childHeadCount > 0) {
    const { error: disconnectErr } = await db.from(table).update({ parent_id: null }).eq('parent_id', id);
    if (disconnectErr) { showToast('Error: ' + disconnectErr.message, 'error'); return; }
  }

  const { error } = await db.from(table).delete().eq('id', id);
  if (error) { showToast('Error: ' + error.message, 'error'); return; }
  showToast('Deleted');
  await loadMasterHeadsList();
  await loadGeneralHeadsList();
}

async function saveMasterField(table, id, field, value) {
  const update = { [field]: value || null };
  const { error } = await db.from(table).update(update).eq('id', id);
  if (error) { showToast('Error: ' + error.message, 'error'); return; }
  showToast('Saved!', 'success');
}

// One "+ Add" for the whole Master List, replacing the old separate Swapna
// tree's own add buttons — for Swapna, the Parent dropdown lists every
// existing node in the chosen event at its real depth, so picking a deep
// node as parent adds another level, same as the old nested "+" buttons
// could, just without needing to browse the tree to find them.
function showMasterAddModal() {
  showModal(`
    <div class="modal-title">+ Add Head / Item</div>
    <div class="form-group">
      <label>Type</label>
      <select id="madd-type" onchange="onMasterAddTypeChange()">
        <option value="general">General Head</option>
        <option value="swapna">Paryushan (Auction) Head</option>
      </select>
    </div>
    <div class="form-group" id="madd-event-group" style="display:none;">
      <label>Event</label>
      <select id="madd-event" onchange="renderMasterAddParentOptions()">
        <option value="">-- Select Event --</option>
        ${masterListEvents.map(e => `<option value="${e.id}">${e.name}</option>`).join('')}
      </select>
    </div>
    <div class="form-group">
      <label id="madd-parent-label">Main Head (required)</label>
      <select id="madd-parent"></select>
    </div>
    <div class="form-group">
      <label>Name</label>
      <input type="text" id="madd-name" placeholder="Head / item name" />
    </div>
    <div class="modal-actions">
      <button class="btn-primary" onclick="saveMasterAdd()">Save</button>
      <button class="btn-secondary" onclick="closeModal()">Cancel</button>
    </div>
  `);
  renderMasterAddParentOptions();
}

function onMasterAddTypeChange() {
  const type = document.getElementById('madd-type').value;
  document.getElementById('madd-event-group').style.display = type === 'swapna' ? 'block' : 'none';
  renderMasterAddParentOptions();
}

function renderMasterAddParentOptions() {
  const type = document.getElementById('madd-type').value;
  const parentSelect = document.getElementById('madd-parent');
  const parentLabel = document.getElementById('madd-parent-label');
  let options = '';

  if (type === 'general') {
    // General heads are always a sub-head of one of the 8 fixed main heads —
    // no "Top Level" option, so a new general item can't accidentally become
    // a 9th untracked main head the way આંગી/Ashtmangal items ended up.
    if (parentLabel) parentLabel.textContent = 'Main Head (required)';
    masterListGeneralHeads.filter(h => !h.parent_id && DR_CATEGORIES.includes(h.name)).forEach(h => {
      options += `<option value="${h.id}">${h.name}</option>`;
    });
  } else {
    if (parentLabel) parentLabel.textContent = 'Parent (optional — leave as Top Level for a new main group)';
    options = '<option value="">-- Top Level --</option>';
    const eventId = document.getElementById('madd-event')?.value;
    if (eventId) {
      const nodes = masterListSwapnaHeads.filter(s => s.event_id === eventId);
      const byId = {};
      nodes.forEach(n => { byId[n.id] = n; });
      const depthOf = n => (n.parent_id && byId[n.parent_id]) ? depthOf(byId[n.parent_id]) + 1 : 0;
      nodes.forEach(n => {
        options += `<option value="${n.id}">${'— '.repeat(depthOf(n))}${n.name}</option>`;
      });
    }
  }
  parentSelect.innerHTML = options;
}

async function saveMasterAdd() {
  const type = document.getElementById('madd-type').value;
  const parentId = document.getElementById('madd-parent').value || null;
  const name = document.getElementById('madd-name').value.trim();
  if (!name) { showToast('Enter a name', 'error'); return; }

  if (type === 'general') {
    if (!parentId) { showToast('Select which of the 8 main heads this belongs under', 'error'); return; }
    const { error } = await db.from('dr_general_heads').insert({
      org_id: currentOrgId, name, parent_id: parentId, unit_mode: 'rupees'
    });
    if (error) { showToast('Error: ' + error.message, 'error'); return; }
  } else {
    const eventId = document.getElementById('madd-event').value;
    if (!eventId) { showToast('Select an event', 'error'); return; }
    const { error } = await db.from('dr_swapna').insert({
      org_id: currentOrgId, event_id: eventId, name, parent_id: parentId, unit_mode: 'rupees'
    });
    if (error) { showToast('Error: ' + error.message, 'error'); return; }
  }

  closeModal();
  showToast('Added!', 'success');
  await loadMasterHeadsList();
  await loadGeneralHeadsList();
}

function onBoliUnitModeChange() {
  const mode = document.getElementById('boli-unit-mode-select').value;
  document.getElementById('boli-rate-mun-group').style.display = (mode === 'mun' || mode === 'mixed') ? 'block' : 'none';
  document.getElementById('boli-rate-aani-group').style.display = (mode === 'aani' || mode === 'mixed') ? 'block' : 'none';
}

async function saveBoliUnitMode() {
  const mode = document.getElementById('boli-unit-mode-select').value;
  const rateInput = document.getElementById('boli-rate-input');
  const rate = rateInput ? parseFloat(rateInput.value) : null;
  const needsMunRate = mode === 'mun' || mode === 'mixed';
  if (needsMunRate && (!rate || rate <= 0)) { showToast('Enter a valid ₹ per Mun rate', 'error'); return; }

  const aaniRateInput = document.getElementById('aani-rate-input');
  const aaniRate = aaniRateInput ? parseFloat(aaniRateInput.value) : null;
  const needsAaniRate = mode === 'aani' || mode === 'mixed';
  if (needsAaniRate && (!aaniRate || aaniRate <= 0)) { showToast('Enter a valid ₹ per Aani rate', 'error'); return; }

  const threshold = parseFloat(document.getElementById('split-threshold-input').value);
  if (!threshold || threshold <= 0) { showToast('Enter a valid split-receipt threshold', 'error'); return; }

  const { error } = await db.from('dr_organizations')
    .update({
      boli_unit_mode: mode,
      rate_per_mun: needsMunRate ? rate : null,
      rate_per_aani: needsAaniRate ? aaniRate : null,
      split_receipt_threshold: threshold
    })
    .eq('id', currentOrgId);
  if (error) { showToast('Error: ' + error.message, 'error'); return; }

  orgBoliUnitMode = mode;
  orgRatePerMun = needsMunRate ? rate : null;
  orgRatePerAani = needsAaniRate ? aaniRate : null;
  orgSplitThreshold = threshold;
  showToast('Boli unit setup saved!', 'success');
  await renderHeads();
}

// Rupees/Mun cascades down the tree: a head's own unit_mode wins if set,
// otherwise it inherits whatever was resolved for its parent. NULL means
// "not set here, inherit".
function effectiveUnit(ownUnitMode, inheritedUnit) {
  return (ownUnitMode === 'mun' || ownUnitMode === 'rupees' || ownUnitMode === 'aani') ? ownUnitMode : inheritedUnit;
}

function unitBadge(resolvedUnit) {
  if (resolvedUnit === 'mun') return ' <span style="font-size:10px;font-weight:700;background:#E3F2FD;color:#1565C0;padding:2px 6px;border-radius:8px;">MUN</span>';
  if (resolvedUnit === 'aani') return ' <span style="font-size:10px;font-weight:700;background:#F3E5F5;color:#7B1FA2;padding:2px 6px;border-radius:8px;">AANI</span>';
  return '';
}

function categoryBadge(category) {
  if (!category) return ' <span style="font-size:10px;font-weight:600;background:#f5f5f5;color:#999;padding:2px 6px;border-radius:8px;">Uncategorized</span>';
  return ` <span style="font-size:10px;font-weight:600;background:#FFF3E0;color:#E65100;padding:2px 6px;border-radius:8px;">${category}</span>`;
}

function pricingBadge() {
  return ''; // Fixed/Auction distinction was dropped — no longer shown
}

function showHeadPropertiesModal(table, id, name, ownMode, inheritedFrom, category, pricingType) {
  const inheritedLabel = inheritedFrom === 'mun' ? 'Mun' : inheritedFrom === 'aani' ? 'Aani' : '₹ Rupees';
  showModal(`
    <div class="modal-title">⚙ Properties — ${name}</div>
    <div class="form-group">
      <label>Unit — this head's boli is spoken in</label>
      <select id="head-unit-mode-select">
        <option value="" ${!ownMode ? 'selected' : ''}>↳ Inherit (currently: ${inheritedLabel})</option>
        <option value="rupees" ${ownMode === 'rupees' ? 'selected' : ''}>₹ Rupees</option>
        <option value="mun" ${ownMode === 'mun' ? 'selected' : ''}>Mun</option>
        <option value="aani" ${ownMode === 'aani' ? 'selected' : ''}>Aani</option>
      </select>
      <p style="font-size:11px;color:var(--text-muted);margin-top:4px;">Setting this here applies to everything below it too, unless overridden lower down.</p>
    </div>
    <div class="form-group">
      <label>Category (for reports)</label>
      <select id="head-category-select">
        <option value="" ${!category ? 'selected' : ''}>-- Uncategorized --</option>
        ${DR_CATEGORIES.map(c => `<option value="${c}" ${category === c ? 'selected' : ''}>${c}</option>`).join('')}
      </select>
    </div>
    <div class="modal-actions">
      <button class="btn-primary" onclick="saveHeadProperties('${table}','${id}')">Save</button>
      <button class="btn-secondary" onclick="closeModal()">Cancel</button>
    </div>
  `);
}

async function saveHeadProperties(table, id) {
  const unit_mode = document.getElementById('head-unit-mode-select').value || null;
  const category = document.getElementById('head-category-select').value || null;

  const { error } = await db.from(table)
    .update({ unit_mode, category })
    .eq('id', id);
  if (error) { showToast('Error: ' + error.message, 'error'); return; }

  closeModal();
  showToast('Saved!', 'success');
  await loadGeneralHeadsList();
  await loadMasterHeadsList();
}

// ========== GENERAL HEADS (independent of event) - NESTED DISPLAY ==========
async function loadGeneralHeadsList() {
  const { data, error } = await db
    .from('dr_general_heads')
    .select('*')
    .eq('org_id', currentOrgId)
    .order('display_order');

  const el = document.getElementById('general-heads-list');
  if (!el) return;

  if (error || !data || data.length === 0) {
    el.innerHTML = `<div class="empty-state"><div class="empty-icon">🔷</div><p>No heads yet. Use "+ Add" in the Master List above.</p></div>`;
    return;
  }

  // Main Donation Heads shows only the 8 fixed khate — other top-level heads
  // (e.g. આંગી, or the promoted Ashtmangal items) still exist and are still
  // pickable in donation entry, just managed via Master List instead of here.
  const mainHeads = data.filter(h => !h.parent_id && DR_CATEGORIES.includes(h.name));
  const subHeads = data.filter(h => h.parent_id);

  el.innerHTML = mainHeads.map((head, i) => renderGeneralMainHead(head, i + 1, subHeads)).join('');
}

function renderGeneralMainHead(head, num, subHeads) {
  const isExpanded = expandedGeneralHeads[head.id];
  const mySubHeads = subHeads.filter(s => s.parent_id === head.id).sort((a,b)=>(a.display_order||0)-(b.display_order||0));
  const hasSubHeads = mySubHeads.length > 0;
  const myUnit = effectiveUnit(head.unit_mode, orgBoliUnitMode === 'mun' ? 'mun' : 'rupees');

  return `
    <div style="border:2px solid var(--primary);border-radius:10px;margin-bottom:12px;overflow:hidden;">
      <div style="display:flex;align-items:center;justify-content:space-between;padding:12px 16px;background:#ffffff;cursor:pointer;"
           onclick="toggleGeneralHead('${head.id}')">
        <strong style="color:var(--primary);font-size:15px;">
          ${hasSubHeads ? (isExpanded ? '▼' : '▶') : '◦'} ${num}. ${head.name}${unitBadge(myUnit)}${categoryBadge(head.category)}${pricingBadge(head.pricing_type)}
          ${hasSubHeads ? `<span style="font-size:11px;font-weight:400;color:var(--text-muted);"> (${mySubHeads.length} sub)</span>` : ''}
        </strong>
        <div style="display:flex;gap:6px;" onclick="event.stopPropagation()">
          <button class="btn-sm btn-secondary" onclick="showHeadPropertiesModal('dr_general_heads','${head.id}','${head.name.replace(/'/g,"\\'")}','${head.unit_mode || ''}','rupees','${head.category || ''}','${head.pricing_type || 'fixed'}')">⚙</button>
          <button class="btn-sm btn-secondary" onclick="showAddGeneralSubHeadModal('${head.id}','${head.name.replace(/'/g,"\\'")}')">+ Sub</button>
          <button class="btn-sm btn-secondary" onclick="showEditGeneralHeadModal('${head.id}','${head.name.replace(/'/g,"\\'")}')">Edit</button>
          <button class="btn-sm btn-danger" onclick="deleteGeneralHead('${head.id}')">Delete</button>
        </div>
      </div>
      ${isExpanded && hasSubHeads ? `
        <div style="padding:8px 16px 12px 24px;">
          ${mySubHeads.map(sub => {
            const subUnit = effectiveUnit(sub.unit_mode, myUnit);
            return `
            <div class="list-item" style="padding:6px 0;display:flex;align-items:center;justify-content:space-between;">
              <span style="font-size:13px;color:var(--text);">└ ${sub.name}${unitBadge(subUnit)}${categoryBadge(sub.category)}${pricingBadge(sub.pricing_type)}</span>
              <div style="display:flex;gap:6px;">
                <button class="btn-sm btn-secondary" onclick="showHeadPropertiesModal('dr_general_heads','${sub.id}','${sub.name.replace(/'/g,"\\'")}','${sub.unit_mode || ''}','${myUnit}','${sub.category || ''}','${sub.pricing_type || 'fixed'}')">⚙</button>
                <button class="btn-sm btn-secondary" onclick="showEditGeneralHeadModal('${sub.id}','${sub.name.replace(/'/g,"\\'")}')">Edit</button>
                <button class="btn-sm btn-danger" onclick="deleteGeneralHead('${sub.id}')">✕</button>
              </div>
            </div>
          `; }).join('')}
        </div>
      ` : ''}
    </div>
  `;
}

function toggleGeneralHead(id) {
  expandedGeneralHeads[id] = !expandedGeneralHeads[id];
  loadGeneralHeadsList();
}

function showAddGeneralSubHeadModal(parentId, parentName) {
  showModal(`
    <div class="modal-title">Add Sub-head to ${parentName}</div>
    <div class="form-group">
      <label>Sub-head Name</label>
      <input type="text" id="gh-sub-name" placeholder="e.g. સ્વસ્તિક" />
    </div>
    <div class="modal-actions">
      <button class="btn-primary" onclick="addGeneralSubHead('${parentId}')">Save</button>
      <button class="btn-secondary" onclick="closeModal()">Cancel</button>
    </div>
  `);
}

async function addGeneralSubHead(parentId) {
  const name = document.getElementById('gh-sub-name').value.trim();
  if (!name) { showToast('Enter sub-head name', 'error'); return; }
  const { error } = await db.from('dr_general_heads').insert({ name, parent_id: parentId, org_id: currentOrgId });
  if (error) { showToast('Error: ' + error.message, 'error'); return; }
  closeModal();
  showToast('Sub-head added!', 'success');
  expandedGeneralHeads[parentId] = true;
  await loadGeneralHeadsList();
}

function showEditGeneralHeadModal(id, name) {
  showModal(`
    <div class="modal-title">Edit Head</div>
    <div class="form-group">
      <label>Head Name</label>
      <input type="text" id="gh-edit" value="${name}" />
    </div>
    <div class="modal-actions">
      <button class="btn-primary" onclick="updateGeneralHead('${id}')">Update</button>
      <button class="btn-secondary" onclick="closeModal()">Cancel</button>
    </div>
  `);
}

async function updateGeneralHead(id) {
  const name = document.getElementById('gh-edit').value.trim();
  if (!name) return;
  const { error } = await db.from('dr_general_heads').update({ name }).eq('id', id);
  if (error) { showToast('Error: ' + error.message, 'error'); return; }
  closeModal();
  showToast('Updated!', 'success');
  await loadGeneralHeadsList();
}

async function deleteGeneralHead(id) {
  if (!confirm('Delete this head? If it has sub-heads, they will also need to be deleted separately.')) return;
  const { error } = await db.from('dr_general_heads').delete().eq('id', id);
  if (error) { showToast('Error: ' + error.message, 'error'); return; }
  showToast('Head deleted');
  await loadGeneralHeadsList();
}
