// ==========================================
// DERASAR BOLI - Heads Setup (Global)
// 6 main heads | Sadharan has 10 sub-heads
// ==========================================

const DEFAULT_MAIN_HEADS = [
  { name: 'સાધારણ',   order: 1 },
  { name: 'દેવદ્રવ્ય', order: 2 },
  { name: 'જીવદયા',   order: 3 },
  { name: 'જ્ઞાન',    order: 4 },
  { name: 'વૈયાવચ',   order: 5 },
  { name: 'આંગી',     order: 6 }
];

const DEFAULT_SADHARAN_SUBHEADS = [
  'સ્વપ્ન ફંડ', 'સાધર્મિક ભક્તિ', 'સ્વામીવાત્સલ્ય',
  'આયંબિલ', 'પાઠશાળા', 'પ્રભાવના', 'બહુમાન',
  'અનુકંપા દાન', 'દેરાસર નિભાવણી', 'સભ્ય અનુદાન'
];

async function renderHeads() {
  const content = document.getElementById('page-content');
  content.innerHTML = `
    <div class="card">
      <div class="section-header">
        <h3>🔶 સ્વપ્ન (Swapna / Auction Groups)</h3>
        <button class="btn-accent btn-sm" onclick="showAddSwapnaModal()">+ Add Swapna</button>
      </div>
      <div id="swapna-list">Loading...</div>
    </div>
    <div class="card">
      <div class="section-header">
        <h3>🔷 Donation Heads</h3>
        <div style="display:flex;gap:8px;">
          <button class="btn-sm btn-secondary" onclick="loadDefaultHeads()">Load Defaults</button>
          <button class="btn-accent btn-sm" onclick="showAddGeneralHeadModal(null, null)">+ Add Main Head</button>
        </div>
      </div>
      <p style="font-size:11px;color:var(--text-muted);margin:0 0 10px;padding:0 4px;">
        6 main heads · <strong>સાધારણ</strong> has 10 sub-heads · All available throughout the year.
      </p>
      <div id="general-heads-list">Loading...</div>
    </div>
  `;
  await loadSwapnaList();
  await loadGeneralHeadsList();
}

// ========== SWAPNA ==========
async function loadSwapnaList() {
  const { data } = await db
    .from('swapna')
    .select('*, swapna_items(*)')
    .is('event_id', null)
    .order('display_order');

  const el = document.getElementById('swapna-list');
  if (!data || data.length === 0) {
    el.innerHTML = `<div class="empty-state"><div class="empty-icon">🔶</div><p>No Swapna added yet.</p></div>`;
    return;
  }

  el.innerHTML = data.map(sw => `
    <div style="border:1.5px solid var(--border);border-radius:8px;padding:12px;margin-bottom:12px;">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;">
        <strong style="color:var(--primary);">${sw.name}</strong>
        <div style="display:flex;gap:6px;">
          <button class="btn-sm btn-secondary" onclick="showAddSwapnaItemModal('${sw.id}','${sw.name.replace(/'/g,"\\'")}')">+ Item</button>
          <button class="btn-sm btn-danger" onclick="deleteSwapna('${sw.id}')">Delete</button>
        </div>
      </div>
      <div style="margin-left:12px;">
        ${(sw.swapna_items || []).length === 0
          ? '<p style="font-size:12px;color:var(--text-muted);">No items yet.</p>'
          : sw.swapna_items.map(item => `
            <div class="list-item" style="padding:6px 0;">
              <span style="font-size:13px;">• ${item.name}</span>
              <div class="list-item-actions">
                <button class="btn-sm btn-secondary" onclick="showEditSwapnaItemModal('${item.id}','${item.name.replace(/'/g,"\\'")}')">Edit</button>
                <button class="btn-sm btn-danger" onclick="deleteSwapnaItem('${item.id}')">✕</button>
              </div>
            </div>
          `).join('')}
      </div>
    </div>
  `).join('');
}

function showAddSwapnaModal() {
  showModal(`
    <div class="modal-title">Add Swapna Group</div>
    <div class="form-group">
      <label>Swapna Name</label>
      <input type="text" id="sw-name" placeholder="e.g. ઇન્દ્ર-ઇન્દ્રાણી સ્વપ્ન" />
    </div>
    <div class="modal-actions">
      <button class="btn-primary" onclick="addSwapna()">Save</button>
      <button class="btn-secondary" onclick="closeModal()">Cancel</button>
    </div>
  `);
}

async function addSwapna() {
  const name = document.getElementById('sw-name').value.trim();
  if (!name) { showToast('Enter swapna name', 'error'); return; }
  const { error } = await db.from('swapna').insert({ name, event_id: null });
  if (error) { showToast('Error: ' + error.message, 'error'); return; }
  closeModal();
  showToast('Swapna added!', 'success');
  await loadSwapnaList();
}

function showAddSwapnaItemModal(swapnaId, swapnaName) {
  showModal(`
    <div class="modal-title">Add Item to ${swapnaName}</div>
    <div class="form-group">
      <label>Item Name</label>
      <input type="text" id="sw-item-name" placeholder="e.g. ફૂલ ની માળા" />
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
  const { error } = await db.from('swapna_items').insert({ swapna_id: swapnaId, name });
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
  await db.from('swapna_items').update({ name }).eq('id', id);
  closeModal();
  showToast('Updated!', 'success');
  await loadSwapnaList();
}

async function deleteSwapna(id) {
  if (!confirm('Delete this Swapna and all its items?')) return;
  await db.from('swapna').delete().eq('id', id);
  showToast('Swapna deleted');
  await loadSwapnaList();
}

async function deleteSwapnaItem(id) {
  if (!confirm('Delete this item?')) return;
  await db.from('swapna_items').delete().eq('id', id);
  showToast('Item deleted');
  await loadSwapnaList();
}

// ========== GENERAL HEADS ==========
async function loadGeneralHeadsList() {
  const { data } = await db
    .from('general_heads')
    .select('*')
    .is('event_id', null)
    .order('display_order');

  const el = document.getElementById('general-heads-list');
  if (!data || data.length === 0) {
    el.innerHTML = `<div class="empty-state"><div class="empty-icon">🔷</div><p>No heads yet. Use "Load Defaults" or add manually.</p></div>`;
    return;
  }

  const mainHeads = data.filter(h => !h.parent_id);
  const subMap = {};
  data.filter(h => h.parent_id).forEach(h => {
    if (!subMap[h.parent_id]) subMap[h.parent_id] = [];
    subMap[h.parent_id].push(h);
  });

  el.innerHTML = mainHeads.map((h, i) => {
    const subs = subMap[h.id] || [];
    return `
      <div style="border:1.5px solid var(--border);border-radius:8px;margin-bottom:10px;overflow:hidden;">
        <div style="display:flex;align-items:center;justify-content:space-between;padding:10px 12px;background:${subs.length ? '#FFF8F0' : '#fff'};">
          <div style="display:flex;align-items:center;gap:8px;flex:1;min-width:0;">
            <span style="font-size:12px;color:var(--text-muted);min-width:22px;">${i + 1}.</span>
            <strong style="color:var(--primary);font-size:14px;">${h.name}</strong>
            ${subs.length ? `<span style="font-size:11px;background:var(--accent);color:white;padding:1px 8px;border-radius:10px;white-space:nowrap;">${subs.length} sub</span>` : ''}
          </div>
          <div style="display:flex;gap:5px;flex-shrink:0;">
            ${subs.length ? `<button class="btn-sm btn-accent" onclick="showAddGeneralHeadModal('${h.id}','${h.name.replace(/'/g,"\\'")}')">+ Sub</button>` : ''}
            <button class="btn-sm btn-secondary" onclick="showEditGeneralHeadModal('${h.id}','${h.name.replace(/'/g,"\\'")}')">Edit</button>
            <button class="btn-sm btn-danger" onclick="deleteGeneralHead('${h.id}')">Del</button>
          </div>
        </div>
        ${subs.length ? `
          <div style="padding:4px 12px 8px 36px;background:#FFFBF5;">
            ${subs.map(s => `
              <div class="list-item" style="padding:5px 0;border-bottom:1px solid #f0e0c0;">
                <span style="font-size:13px;">└ ${s.name}</span>
                <div class="list-item-actions">
                  <button class="btn-sm btn-secondary" onclick="showEditGeneralHeadModal('${s.id}','${s.name.replace(/'/g,"\\'")}')">Edit</button>
                  <button class="btn-sm btn-danger" onclick="deleteGeneralHead('${s.id}')">✕</button>
                </div>
              </div>
            `).join('')}
          </div>
        ` : ''}
      </div>`;
  }).join('');
}

async function loadDefaultHeads() {
  if (!confirm('Load all default Gujarati heads (6 main + 10 sub-heads under સાધારણ)? Existing global heads will NOT be deleted.')) return;

  const { data: mains, error: mErr } = await db.from('general_heads')
    .insert(DEFAULT_MAIN_HEADS.map(h => ({ name: h.name, display_order: h.order, event_id: null, parent_id: null })))
    .select();
  if (mErr) { showToast('Error: ' + mErr.message, 'error'); return; }

  const sadharanId = mains.find(h => h.name === 'સાધારણ')?.id;
  if (!sadharanId) { showToast('Could not find Sadharan ID', 'error'); return; }

  const { error: sErr } = await db.from('general_heads').insert(
    DEFAULT_SADHARAN_SUBHEADS.map((name, i) => ({ name, display_order: i + 1, event_id: null, parent_id: sadharanId }))
  );
  if (sErr) { showToast('Error: ' + sErr.message, 'error'); return; }

  showToast('Default heads loaded!', 'success');
  await loadGeneralHeadsList();
}

function showAddGeneralHeadModal(parentId, parentName) {
  const title = parentId ? `Add Sub-head under ${parentName}` : 'Add Main Head';
  showModal(`
    <div class="modal-title">${title}</div>
    <div class="form-group">
      <label>Head Name (Gujarati)</label>
      <input type="text" id="gh-name" placeholder="e.g. નવો હેડ" />
    </div>
    <div class="modal-actions">
      <button class="btn-primary" onclick="addGeneralHead('${parentId || ''}')">Save</button>
      <button class="btn-secondary" onclick="closeModal()">Cancel</button>
    </div>
  `);
}

async function addGeneralHead(parentId) {
  const name = document.getElementById('gh-name').value.trim();
  if (!name) { showToast('Enter head name', 'error'); return; }
  const { error } = await db.from('general_heads').insert({
    name,
    event_id: null,
    parent_id: parentId || null
  });
  if (error) { showToast('Error: ' + error.message, 'error'); return; }
  closeModal();
  showToast('Head added!', 'success');
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
  await db.from('general_heads').update({ name }).eq('id', id);
  closeModal();
  showToast('Updated!', 'success');
  await loadGeneralHeadsList();
}

async function deleteGeneralHead(id) {
  if (!confirm('Delete this head?')) return;
  await db.from('general_heads').delete().eq('id', id);
  showToast('Head deleted');
  await loadGeneralHeadsList();
}
