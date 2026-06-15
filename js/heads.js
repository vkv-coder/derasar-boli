// ==========================================
// DERASAR BOLI - Heads Setup
// ==========================================

let selectedEventForHeads = null;

const DEFAULT_GENERAL_HEADS = [
  'Jivdaya', 'Sadharan', 'Angi', 'Otnere',
  'Swamivatsalya Coupon', 'New Member Fee',
  'Member Renewal Fee', 'Nishal Garna'
];

async function renderHeads() {
  const content = document.getElementById('page-content');

  // Load events
  const { data: events } = await db.from('events').select('*').order('created_at', { ascending: false });

  content.innerHTML = `
    <div class="card">
      <div class="card-title">Heads Setup</div>
      <div class="form-group">
        <label>Select Event</label>
        <select id="heads-event-select" onchange="onHeadsEventChange()">
          <option value="">-- Select Event --</option>
          ${(events || []).map(ev => `<option value="${ev.id}">${ev.name}</option>`).join('')}
        </select>
      </div>
    </div>
    <div id="heads-content"></div>
  `;
}

async function onHeadsEventChange() {
  selectedEventForHeads = document.getElementById('heads-event-select').value;
  if (!selectedEventForHeads) return;
  await loadHeadsContent();
}

async function loadHeadsContent() {
  const el = document.getElementById('heads-content');
  el.innerHTML = `
    <div class="card">
      <div class="section-header">
        <h3>🔶 Swapna (Auction Groups)</h3>
        <button class="btn-accent btn-sm" onclick="showAddSwapnaModal()">+ Add Swapna</button>
      </div>
      <div id="swapna-list">Loading...</div>
    </div>
    <div class="card">
      <div class="section-header">
        <h3>🔷 General Donation Heads</h3>
        <div style="display:flex;gap:8px;">
          <button class="btn-sm btn-secondary" onclick="loadDefaultHeads()">Load Defaults</button>
          <button class="btn-accent btn-sm" onclick="showAddGeneralHeadModal()">+ Add Head</button>
        </div>
      </div>
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
    .eq('event_id', selectedEventForHeads)
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
          <button class="btn-sm btn-secondary" onclick="showAddSwapnaItemModal('${sw.id}','${sw.name}')">+ Item</button>
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
                <button class="btn-sm btn-secondary" onclick="showEditSwapnaItemModal('${item.id}','${item.name}')">Edit</button>
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
    <div class="modal-title">Add Swapna</div>
    <div class="form-group">
      <label>Swapna Name</label>
      <input type="text" id="sw-name" placeholder="e.g. Swapna 1" />
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
  const { error } = await db.from('swapna').insert({ event_id: selectedEventForHeads, name });
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
      <input type="text" id="sw-item-name" placeholder="e.g. Ful ni Mala" />
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
    .eq('event_id', selectedEventForHeads)
    .order('display_order');

  const el = document.getElementById('general-heads-list');
  if (!data || data.length === 0) {
    el.innerHTML = `<div class="empty-state"><div class="empty-icon">🔷</div><p>No heads yet. Use "Load Defaults" or add manually.</p></div>`;
    return;
  }

  el.innerHTML = `
    <table class="data-table">
      <thead><tr><th>#</th><th>Head Name</th><th>Actions</th></tr></thead>
      <tbody>
        ${data.map((h, i) => `
          <tr>
            <td>${i + 1}</td>
            <td>${h.name}</td>
            <td>
              <div style="display:flex;gap:6px;">
                <button class="btn-sm btn-secondary" onclick="showEditGeneralHeadModal('${h.id}','${h.name}')">Edit</button>
                <button class="btn-sm btn-danger" onclick="deleteGeneralHead('${h.id}')">Delete</button>
              </div>
            </td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;
}

async function loadDefaultHeads() {
  if (!confirm('This will add all default heads to this event. Continue?')) return;
  const inserts = DEFAULT_GENERAL_HEADS.map((name, i) => ({
    event_id: selectedEventForHeads,
    name,
    display_order: i
  }));
  const { error } = await db.from('general_heads').insert(inserts);
  if (error) { showToast('Error: ' + error.message, 'error'); return; }
  showToast('Default heads loaded!', 'success');
  await loadGeneralHeadsList();
}

function showAddGeneralHeadModal() {
  showModal(`
    <div class="modal-title">Add General Head</div>
    <div class="form-group">
      <label>Head Name</label>
      <input type="text" id="gh-name" placeholder="e.g. Jivdaya" />
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
  const { error } = await db.from('general_heads').insert({ event_id: selectedEventForHeads, name });
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
