// ==========================================
// DERASAR BOLI - Heads Setup
// ==========================================

let selectedEventForHeads = null;
let expandedHeads = {};  // track which heads are expanded
let expandedGeneralHeads = {};  // track which general heads are expanded
let orgBoliUnitMode = 'rupees';
let orgRatePerMun = null;

const DEFAULT_GENERAL_HEADS = [
  'sadharan', 'gyan khate', 'jivdaya khate', 'Angi khate',
  'devdravya khate', 'veyavcch khate', 'sadharmik bhakti',
  'swamivatsalya', 'ayambil', 'pathshala', 'prabhavna',
  'bahuman', 'anukampa daan', 'derasar nibhavani', 'sabhya anudan'
];

async function renderHeads() {
  const content = document.getElementById('page-content');
  const [{ data: events }, { data: orgData }] = await Promise.all([
    db.from('dr_events').select('*').eq('org_id', currentOrgId).order('created_at', { ascending: false }),
    db.from('dr_organizations').select('boli_unit_mode, rate_per_mun').eq('id', currentOrgId).single()
  ]);

  orgBoliUnitMode = orgData?.boli_unit_mode || 'rupees';
  orgRatePerMun = orgData?.rate_per_mun ?? null;

  content.innerHTML = `
    <div class="card">
      <div class="card-title">⚖️ Boli Unit Setup</div>
      <div class="form-group">
        <label>How is boli (bid) spoken in your Sangh?</label>
        <select id="boli-unit-mode-select" onchange="onBoliUnitModeChange()">
          <option value="rupees" ${orgBoliUnitMode === 'rupees' ? 'selected' : ''}>₹ All Rupees</option>
          <option value="mun" ${orgBoliUnitMode === 'mun' ? 'selected' : ''}>All in Mun</option>
          <option value="mixed" ${orgBoliUnitMode === 'mixed' ? 'selected' : ''}>Part Rupees, Part Mun (set per head below)</option>
        </select>
      </div>
      <div class="form-group" id="boli-rate-group" style="display:${orgBoliUnitMode === 'mun' ? 'block' : 'none'};">
        <label>Rate (₹ per Mun) — applies to all heads</label>
        <input type="number" id="boli-rate-input" value="${orgRatePerMun ?? ''}" placeholder="e.g. 5000" min="0" />
      </div>
      <button class="btn-primary btn-sm" onclick="saveBoliUnitMode()">Save</button>
      ${orgBoliUnitMode === 'mixed' ? `<p style="font-size:12px;color:var(--text-muted);margin-top:8px;">Set Rupees or Mun for each head below using the ⚖️ button next to it.</p>` : ''}
    </div>
    <div class="card">
      <div class="card-title">Heads Setup</div>
      <div class="form-group">
        <label>Select Event (for Swapna / Auction Groups)</label>
        <select id="heads-event-select" onchange="onHeadsEventChange()">
          <option value="">-- Select Event --</option>
          ${(events || []).map(ev => `<option value="${ev.id}">${ev.name}</option>`).join('')}
        </select>
      </div>
    </div>
    <div id="swapna-section"></div>
    <div class="card">
      <div class="section-header">
        <h3>🔷 General Donation Heads</h3>
        <div style="display:flex;gap:8px;">
          <button class="btn-sm btn-secondary" onclick="loadDefaultHeads()">Load Defaults</button>
          <button class="btn-accent btn-sm" onclick="showAddGeneralHeadModal()">+ Add Main Head</button>
        </div>
      </div>
      <div id="general-heads-list">Loading...</div>
    </div>
  `;
  await loadGeneralHeadsList();
}

function onBoliUnitModeChange() {
  const mode = document.getElementById('boli-unit-mode-select').value;
  document.getElementById('boli-rate-group').style.display = mode === 'mun' ? 'block' : 'none';
}

async function saveBoliUnitMode() {
  const mode = document.getElementById('boli-unit-mode-select').value;
  const rateInput = document.getElementById('boli-rate-input');
  const rate = rateInput ? parseFloat(rateInput.value) : null;
  if (mode === 'mun' && (!rate || rate <= 0)) { showToast('Enter a valid ₹ per Mun rate', 'error'); return; }

  const { error } = await db.from('dr_organizations')
    .update({ boli_unit_mode: mode, rate_per_mun: mode === 'mun' ? rate : null })
    .eq('id', currentOrgId);
  if (error) { showToast('Error: ' + error.message, 'error'); return; }

  orgBoliUnitMode = mode;
  orgRatePerMun = mode === 'mun' ? rate : null;
  showToast('Boli unit setup saved!', 'success');
  await renderHeads();
  if (selectedEventForHeads) {
    document.getElementById('heads-event-select').value = selectedEventForHeads;
    await loadSwapnaSection();
  }
}

async function onHeadsEventChange() {
  selectedEventForHeads = document.getElementById('heads-event-select').value;
  expandedHeads = {};
  if (!selectedEventForHeads) {
    document.getElementById('swapna-section').innerHTML = '';
    return;
  }
  await loadSwapnaSection();
}

async function loadSwapnaSection() {
  const el = document.getElementById('swapna-section');
  el.innerHTML = `
    <div class="card">
      <div class="section-header">
        <h3>🔶 સ્વપ્ન (Swapna / Auction Groups)</h3>
        <button class="btn-accent btn-sm" onclick="showAddSwapnaModal()">+ Add</button>
      </div>
      <div id="swapna-list">Loading...</div>
    </div>
  `;
  await loadSwapnaList();
}

// ========== SWAPNA - 3 LEVEL COLLAPSIBLE ==========
async function loadSwapnaList() {
  // Fetch all swapna for this event with their swapna_items
  const { data, error } = await db
    .from('dr_swapna')
    .select('*, dr_swapna_items(*)')
    .eq('event_id', selectedEventForHeads)
    .eq('org_id', currentOrgId)
    .order('sort_order');

  const el = document.getElementById('swapna-list');
  if (!el) return;

  if (error || !data || data.length === 0) {
    el.innerHTML = `<div class="empty-state"><div class="empty-icon">🔶</div><p>No heads added yet.</p></div>`;
    return;
  }

  // Separate: top-level heads (parent_id IS NULL) and children
  const topLevel = data.filter(s => !s.parent_id);
  const children = data.filter(s => s.parent_id);

  el.innerHTML = topLevel.map(head => renderMainHead(head, children, data)).join('');
}

function renderMainHead(head, children, allData) {
  const isExpanded = expandedHeads[head.id];
  const myChildren = children.filter(c => c.parent_id === head.id);
  const hasChildren = myChildren.length > 0;
  const hasItems = (head.dr_swapna_items || []).length > 0;

  return `
    <div style="border:2px solid var(--primary);border-radius:10px;margin-bottom:12px;overflow:hidden;">
      <div style="display:flex;align-items:center;justify-content:space-between;padding:12px 16px;background:#ffffff;cursor:pointer;"
           onclick="toggleHead('${head.id}')">
        <strong style="color:var(--primary);font-size:15px;">
          ${isExpanded ? '▼' : '▶'} ${head.name}${unitBadge(head)}
        </strong>
        <div style="display:flex;gap:6px;" onclick="event.stopPropagation()">
          ${orgBoliUnitMode === 'mixed' ? `<button class="btn-sm btn-secondary" onclick="showHeadUnitModal('dr_swapna','${head.id}','${head.name.replace(/'/g,"\\'")}','${head.unit_mode || 'rupees'}',${head.rate_per_mun != null ? head.rate_per_mun : 'null'})">⚖️</button>` : ''}
          <button class="btn-sm btn-danger" onclick="deleteSwapna('${head.id}')">Delete</button>
        </div>
      </div>
      ${isExpanded ? `
        <div style="padding:8px 16px 12px 24px;">
          ${hasChildren ? myChildren.sort((a,b)=>(a.sort_order||0)-(b.sort_order||0)).map(child => renderChildHead(child, allData)).join('') : ''}
          ${hasItems ? renderSwapnaItems(head) : ''}
          ${!hasChildren && !hasItems ? `<p style="color:var(--text-muted);font-size:13px;">No sub-heads yet.</p>` : ''}
        </div>
      ` : ''}
    </div>
  `;
}

function renderChildHead(child, allData) {
  const isExpanded = expandedHeads[child.id];
  const grandChildren = allData.filter(s => s.parent_id === child.id);
  const hasGrandChildren = grandChildren.length > 0;
  const hasItems = (child.dr_swapna_items || []).length > 0;

  return `
    <div style="border:1.5px solid var(--border);border-radius:8px;margin-bottom:8px;overflow:hidden;">
      <div style="display:flex;align-items:center;justify-content:space-between;padding:10px 12px;background:#fff;cursor:pointer;"
           onclick="toggleHead('${child.id}')">
        <span style="color:var(--primary-dark, #7a4a00);font-size:14px;">
          ${isExpanded ? '▼' : '▶'} ${child.name}${unitBadge(child)}
        </span>
        <div style="display:flex;gap:6px;" onclick="event.stopPropagation()">
          ${orgBoliUnitMode === 'mixed' ? `<button class="btn-sm btn-secondary" onclick="showHeadUnitModal('dr_swapna','${child.id}','${child.name.replace(/'/g,"\\'")}','${child.unit_mode || 'rupees'}',${child.rate_per_mun != null ? child.rate_per_mun : 'null'})">⚖️</button>` : ''}
          <button class="btn-sm btn-secondary" onclick="showAddSwapnaItemModal('${child.id}','${child.name.replace(/'/g,"\\'")}')">+ Item</button>
          <button class="btn-sm btn-danger" onclick="deleteSwapna('${child.id}')">✕</button>
        </div>
      </div>
      ${isExpanded ? `
        <div style="padding:6px 12px 10px 24px;">
          ${hasGrandChildren ? grandChildren.sort((a,b)=>(a.sort_order||0)-(b.sort_order||0)).map(gc => `
            <div style="padding:4px 0;font-size:13px;color:var(--text);">• ${gc.name}${unitBadge(gc)}
              ${orgBoliUnitMode === 'mixed' ? `<button class="btn-sm btn-secondary" style="margin-left:8px;" onclick="showHeadUnitModal('dr_swapna','${gc.id}','${gc.name.replace(/'/g,"\\'")}','${gc.unit_mode || 'rupees'}',${gc.rate_per_mun != null ? gc.rate_per_mun : 'null'})">⚖️</button>` : ''}
              <button class="btn-sm btn-danger" style="margin-left:8px;" onclick="deleteSwapna('${gc.id}')">✕</button>
            </div>
          `).join('') : ''}
          ${hasItems ? renderSwapnaItems(child) : ''}
          ${!hasGrandChildren && !hasItems ? `<p style="color:var(--text-muted);font-size:12px;">No items yet.</p>` : ''}
        </div>
      ` : ''}
    </div>
  `;
}

function renderSwapnaItems(swapna) {
  const items = (swapna.dr_swapna_items || []).sort((a,b) => (a.sort_order||0) - (b.sort_order||0));
  if (items.length === 0) return '';
  return items.map(item => `
    <div class="list-item" style="padding:5px 0;">
      <span style="font-size:13px;">• ${item.name}${unitBadge(item)}</span>
      <div class="list-item-actions">
        ${orgBoliUnitMode === 'mixed' ? `<button class="btn-sm btn-secondary" onclick="showHeadUnitModal('dr_swapna_items','${item.id}','${item.name.replace(/'/g,"\\'")}','${item.unit_mode || 'rupees'}',${item.rate_per_mun != null ? item.rate_per_mun : 'null'})">⚖️</button>` : ''}
        <button class="btn-sm btn-secondary" onclick="showEditSwapnaItemModal('${item.id}','${item.name.replace(/'/g,"\\'")}')">Edit</button>
        <button class="btn-sm btn-danger" onclick="deleteSwapnaItem('${item.id}')">✕</button>
      </div>
    </div>
  `).join('');
}

function unitBadge(head) {
  if (orgBoliUnitMode === 'mun') return ' <span style="font-size:10px;font-weight:700;background:#E3F2FD;color:#1565C0;padding:2px 6px;border-radius:8px;">MUN</span>';
  if (orgBoliUnitMode === 'mixed' && head.unit_mode === 'mun') return ' <span style="font-size:10px;font-weight:700;background:#E3F2FD;color:#1565C0;padding:2px 6px;border-radius:8px;">MUN</span>';
  return '';
}

function showHeadUnitModal(table, id, name, currentMode, currentRate) {
  showModal(`
    <div class="modal-title">Unit — ${name}</div>
    <div class="form-group">
      <label>This head's boli is spoken in</label>
      <select id="head-unit-mode-select" onchange="onHeadUnitModeChange()">
        <option value="rupees" ${currentMode === 'rupees' ? 'selected' : ''}>₹ Rupees</option>
        <option value="mun" ${currentMode === 'mun' ? 'selected' : ''}>Mun</option>
      </select>
    </div>
    <div class="form-group" id="head-unit-rate-group" style="display:${currentMode === 'mun' ? 'block' : 'none'};">
      <label>Rate (₹ per Mun) for this head</label>
      <input type="number" id="head-unit-rate-input" value="${currentRate != null ? currentRate : ''}" placeholder="e.g. 5000" min="0" />
    </div>
    <div class="modal-actions">
      <button class="btn-primary" onclick="saveHeadUnit('${table}','${id}')">Save</button>
      <button class="btn-secondary" onclick="closeModal()">Cancel</button>
    </div>
  `);
}

function onHeadUnitModeChange() {
  const mode = document.getElementById('head-unit-mode-select').value;
  document.getElementById('head-unit-rate-group').style.display = mode === 'mun' ? 'block' : 'none';
}

async function saveHeadUnit(table, id) {
  const mode = document.getElementById('head-unit-mode-select').value;
  const rateInput = document.getElementById('head-unit-rate-input');
  const rate = rateInput ? parseFloat(rateInput.value) : null;
  if (mode === 'mun' && (!rate || rate <= 0)) { showToast('Enter a valid ₹ per Mun rate', 'error'); return; }

  const { error } = await db.from(table)
    .update({ unit_mode: mode, rate_per_mun: mode === 'mun' ? rate : null })
    .eq('id', id);
  if (error) { showToast('Error: ' + error.message, 'error'); return; }

  closeModal();
  showToast('Unit saved!', 'success');
  await loadSwapnaList();
}

function toggleHead(id) {
  expandedHeads[id] = !expandedHeads[id];
  loadSwapnaList();
}

function showAddSwapnaModal() {
  showModal(`
    <div class="modal-title">Add Main Head</div>
    <div class="form-group">
      <label>Head Name</label>
      <input type="text" id="sw-name" placeholder="e.g. ચૌદ સ્વપ્ન ના ચઢાવા" />
    </div>
    <div class="modal-actions">
      <button class="btn-primary" onclick="addSwapna()">Save</button>
      <button class="btn-secondary" onclick="closeModal()">Cancel</button>
    </div>
  `);
}

async function addSwapna() {
  const name = document.getElementById('sw-name').value.trim();
  if (!name) { showToast('Enter head name', 'error'); return; }
  const { error } = await db.from('dr_swapna').insert({ event_id: selectedEventForHeads, name, org_id: currentOrgId });
  if (error) { showToast('Error: ' + error.message, 'error'); return; }
  closeModal();
  showToast('Head added!', 'success');
  await loadSwapnaList();
}

function showAddSwapnaItemModal(swapnaId, swapnaName) {
  showModal(`
    <div class="modal-title">Add Item to ${swapnaName}</div>
    <div class="form-group">
      <label>Item Name</label>
      <input type="text" id="sw-item-name" placeholder="e.g. પ્રથમ સ્વપ્ન" />
    </div>
    <div class="modal-actions">
      <button class="btn-primary" onclick="addSwapnaItem('${swapnaId}')">Save</button>
      <button class="btn-secondary" onclick="closeModal()">Cancel</button>
    </div>
  `);
}

async function addSwapnaItem(swapnaId) {
  const name = document.getElementById('sw-item-name').value.trim();
  if (!name) { showToast('Enter item name', 'error'); return; }
  const { error } = await db.from('dr_swapna_items').insert({ swapna_id: swapnaId, name, org_id: currentOrgId });
  if (error) { showToast('Error: ' + error.message, 'error'); return; }
  closeModal();
  showToast('Item added!', 'success');
  await loadSwapnaList();
}

function showEditSwapnaItemModal(id, name) {
  showModal(`
    <div class="modal-title">Edit Item</div>
    <div class="form-group">
      <label>Item Name</label>
      <input type="text" id="sw-item-edit" value="${name}" />
    </div>
    <div class="modal-actions">
      <button class="btn-primary" onclick="updateSwapnaItem('${id}')">Update</button>
      <button class="btn-secondary" onclick="closeModal()">Cancel</button>
    </div>
  `);
}

async function updateSwapnaItem(id) {
  const name = document.getElementById('sw-item-edit').value.trim();
  if (!name) return;
  const { error } = await db.from('dr_swapna_items').update({ name }).eq('id', id);
  if (error) { showToast('Error: ' + error.message, 'error'); return; }
  closeModal();
  showToast('Updated!', 'success');
  await loadSwapnaList();
}

async function deleteSwapna(id) {
  if (!confirm('Delete this head and all its items?')) return;
  const { error } = await db.from('dr_swapna').delete().eq('id', id);
  if (error) { showToast('Error: ' + error.message, 'error'); return; }
  showToast('Deleted');
  await loadSwapnaList();
}

async function deleteSwapnaItem(id) {
  if (!confirm('Delete this item?')) return;
  const { error } = await db.from('dr_swapna_items').delete().eq('id', id);
  if (error) { showToast('Error: ' + error.message, 'error'); return; }
  showToast('Item deleted');
  await loadSwapnaList();
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
    el.innerHTML = `<div class="empty-state"><div class="empty-icon">🔷</div><p>No heads yet. Use "Load Defaults" or add manually.</p></div>`;
    return;
  }

  // Separate main heads (parent_id IS NULL) from sub-heads
  const mainHeads = data.filter(h => !h.parent_id);
  const subHeads = data.filter(h => h.parent_id);

  el.innerHTML = mainHeads.map((head, i) => renderGeneralMainHead(head, i + 1, subHeads)).join('');
}

function renderGeneralMainHead(head, num, subHeads) {
  const isExpanded = expandedGeneralHeads[head.id];
  const mySubHeads = subHeads.filter(s => s.parent_id === head.id).sort((a,b)=>(a.display_order||0)-(b.display_order||0));
  const hasSubHeads = mySubHeads.length > 0;

  return `
    <div style="border:2px solid var(--primary);border-radius:10px;margin-bottom:12px;overflow:hidden;">
      <div style="display:flex;align-items:center;justify-content:space-between;padding:12px 16px;background:#ffffff;cursor:pointer;"
           onclick="toggleGeneralHead('${head.id}')">
        <strong style="color:var(--primary);font-size:15px;">
          ${hasSubHeads ? (isExpanded ? '▼' : '▶') : '◦'} ${num}. ${head.name}
          ${hasSubHeads ? `<span style="font-size:11px;font-weight:400;color:var(--text-muted);"> (${mySubHeads.length} sub)</span>` : ''}
        </strong>
        <div style="display:flex;gap:6px;" onclick="event.stopPropagation()">
          <button class="btn-sm btn-secondary" onclick="showAddGeneralSubHeadModal('${head.id}','${head.name.replace(/'/g,"\\'")}')">+ Sub</button>
          <button class="btn-sm btn-secondary" onclick="showEditGeneralHeadModal('${head.id}','${head.name.replace(/'/g,"\\'")}')">Edit</button>
          <button class="btn-sm btn-danger" onclick="deleteGeneralHead('${head.id}')">Delete</button>
        </div>
      </div>
      ${isExpanded && hasSubHeads ? `
        <div style="padding:8px 16px 12px 24px;">
          ${mySubHeads.map(sub => `
            <div class="list-item" style="padding:6px 0;display:flex;align-items:center;justify-content:space-between;">
              <span style="font-size:13px;color:var(--text);">└ ${sub.name}</span>
              <div style="display:flex;gap:6px;">
                <button class="btn-sm btn-secondary" onclick="showEditGeneralHeadModal('${sub.id}','${sub.name.replace(/'/g,"\\'")}')">Edit</button>
                <button class="btn-sm btn-danger" onclick="deleteGeneralHead('${sub.id}')">✕</button>
              </div>
            </div>
          `).join('')}
        </div>
      ` : ''}
    </div>
  `;
}

function toggleGeneralHead(id) {
  expandedGeneralHeads[id] = !expandedGeneralHeads[id];
  loadGeneralHeadsList();
}

async function loadDefaultHeads() {
  if (!confirm('This will add all default heads. Continue?')) return;
  const inserts = DEFAULT_GENERAL_HEADS.map((name, i) => ({ name, display_order: i + 1, org_id: currentOrgId }));
  const { error } = await db.from('dr_general_heads').insert(inserts);
  if (error) { showToast('Error: ' + error.message, 'error'); return; }
  showToast('Default heads loaded!', 'success');
  await loadGeneralHeadsList();
}

function showAddGeneralHeadModal() {
  showModal(`
    <div class="modal-title">Add Main Head</div>
    <div class="form-group">
      <label>Head Name</label>
      <input type="text" id="gh-name" placeholder="e.g. જ્ઞાન ખાતે" />
    </div>
    <div class="modal-actions">
      <button class="btn-primary" onclick="addGeneralHead()">Save</button>
      <button class="btn-secondary" onclick="closeModal()">Cancel</button>
    </div>
  `);
}

async function addGeneralHead() {
  const name = document.getElementById('gh-name').value.trim();
  if (!name) { showToast('Enter head name', 'error'); return; }
  const { error } = await db.from('dr_general_heads').insert({ name, org_id: currentOrgId });
  if (error) { showToast('Error: ' + error.message, 'error'); return; }
  closeModal();
  showToast('Head added!', 'success');
  await loadGeneralHeadsList();
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
