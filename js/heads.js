// ==========================================
// DERASAR BOLI - Heads Setup
// ==========================================

let selectedEventForHeads = null;
let expandedHeads = {};  // track which heads are expanded

const DEFAULT_GENERAL_HEADS = [
  'sadharan', 'gyan khate', 'jivdaya khate', 'Angi khate',
  'devdravya khate', 'veyavcch khate', 'sadharmik bhakti',
  'swamivatsalya', 'ayambil', 'pathshala', 'prabhavna',
  'bahuman', 'anukampa daan', 'derasar nibhavani', 'sabhya anudan'
];

async function renderHeads() {
  const content = document.getElementById('page-content');
  const { data: events } = await db.from('events').select('*').order('created_at', { ascending: false });

  content.innerHTML = `
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
          <button class="btn-accent btn-sm" onclick="showAddGeneralHeadModal()">+ Add Head</button>
        </div>
      </div>
      <div id="general-heads-list">Loading...</div>
    </div>
  `;
  await loadGeneralHeadsList();
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
    .from('swapna')
    .select('*, swapna_items(*)')
    .eq('event_id', selectedEventForHeads)
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
  const hasItems = (head.swapna_items || []).length > 0;

  return `
    <div style="border:2px solid var(--primary);border-radius:10px;margin-bottom:12px;overflow:hidden;">
      <div style="display:flex;align-items:center;justify-content:space-between;padding:12px 16px;background:var(--primary-light, #fdf3e3);cursor:pointer;"
           onclick="toggleHead('${head.id}')">
        <strong style="color:var(--primary);font-size:15px;">
          ${isExpanded ? '▼' : '▶'} ${head.name}
        </strong>
        <div style="display:flex;gap:6px;" onclick="event.stopPropagation()">
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
  const hasItems = (child.swapna_items || []).length > 0;

  return `
    <div style="border:1.5px solid var(--border);border-radius:8px;margin-bottom:8px;overflow:hidden;">
      <div style="display:flex;align-items:center;justify-content:space-between;padding:10px 12px;background:#fff;cursor:pointer;"
           onclick="toggleHead('${child.id}')">
        <span style="color:var(--primary-dark, #7a4a00);font-size:14px;">
          ${isExpanded ? '▼' : '▶'} ${child.name}
        </span>
        <div style="display:flex;gap:6px;" onclick="event.stopPropagation()">
          <button class="btn-sm btn-secondary" onclick="showAddSwapnaItemModal('${child.id}','${child.name.replace(/'/g,"\\'")}')">+ Item</button>
          <button class="btn-sm btn-danger" onclick="deleteSwapna('${child.id}')">✕</button>
        </div>
      </div>
      ${isExpanded ? `
        <div style="padding:6px 12px 10px 24px;">
          ${hasGrandChildren ? grandChildren.sort((a,b)=>(a.sort_order||0)-(b.sort_order||0)).map(gc => `
            <div style="padding:4px 0;font-size:13px;color:var(--text);">• ${gc.name}
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
  const items = (swapna.swapna_items || []).sort((a,b) => (a.sort_order||0) - (b.sort_order||0));
  if (items.length === 0) return '';
  return items.map(item => `
    <div class="list-item" style="padding:5px 0;">
      <span style="font-size:13px;">• ${item.name}</span>
      <div class="list-item-actions">
        <button class="btn-sm btn-secondary" onclick="showEditSwapnaItemModal('${item.id}','${item.name.replace(/'/g,"\\'")}')">Edit</button>
        <button class="btn-sm btn-danger" onclick="deleteSwapnaItem('${item.id}')">✕</button>
      </div>
    </div>
  `).join('');
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
  const { error } = await db.from('swapna').insert({ event_id: selectedEventForHeads, name });
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
      <input type="text" id="sw-item-name" placeholder="e.g. ઝૂલાવવાનો ચઢાવો" />
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
  if (!confirm('Delete this head and all its items?')) return;
  await db.from('swapna').delete().eq('id', id);
  showToast('Deleted');
  await loadSwapnaList();
}

async function deleteSwapnaItem(id) {
  if (!confirm('Delete this item?')) return;
  await db.from('swapna_items').delete().eq('id', id);
  showToast('Item deleted');
  await loadSwapnaList();
}

// ========== GENERAL HEADS (independent of event) ==========
async function loadGeneralHeadsList() {
  const { data, error } = await db
    .from('general_heads')
    .select('*')
    .order('display_order');

  const el = document.getElementById('general-heads-list');
  if (!el) return;

  if (error || !data || data.length === 0) {
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
                <button class="btn-sm btn-secondary" onclick="showEditGeneralHeadModal('${h.id}','${h.name.replace(/'/g,"\\'")}')">Edit</button>
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
  if (!confirm('This will add all default heads. Continue?')) return;
  const inserts = DEFAULT_GENERAL_HEADS.map((name, i) => ({ name, display_order: i + 1 }));
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
  const { error } = await db.from('general_heads').insert({ name });
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
