// ==========================================
// DERASAR BOLI - Donation Entry (Token Desk)
// ==========================================
// Workflow: pick/enter the donor ONCE for this visit, browse heads and
// "+ Add" each item into a running cart, then either save the cart
// directly (quick single entries) or "Generate Token" to bundle every
// cart line under one token + one printed slip for the payment table.

let entryEventId = null;
let expandedEntryHeads = {};
let recentEntries = [];
let lastSavedDonationId = null;
let entryBoliMode = 'rupees';
let entryBoliRate = null;
let entryAaniRate = null;
let entrySplitThreshold = 20000;

let currentCart = [];
let cartPayer = null; // { memberId, name, phone, familyNo }

// Resolves the effective unit for a given head, based on the org-wide
// master switch (Boli Unit Setup) — only 'mixed' mode looks at the
// per-head unit_mode (which itself cascades down the tree, see
// entryEffectiveUnit()); rates are always the single org-wide rate
// ("one temple, one rate"), never a per-head value.
function resolveHeadUnit(effectiveUnitMode) {
  if (entryBoliMode === 'rupees') return { mode: 'rupees', rate: null };
  if (entryBoliMode === 'mun') return { mode: 'mun', rate: entryBoliRate };
  if (entryBoliMode === 'aani') return { mode: 'aani', rate: entryAaniRate };
  if (effectiveUnitMode === 'mun') return { mode: 'mun', rate: entryBoliRate };
  if (effectiveUnitMode === 'aani') return { mode: 'aani', rate: entryAaniRate };
  return { mode: 'rupees', rate: null };
}

// Own unit_mode wins if set, otherwise inherits from the parent's resolved value.
function entryEffectiveUnit(ownUnitMode, inheritedUnit) {
  return (ownUnitMode === 'mun' || ownUnitMode === 'rupees' || ownUnitMode === 'aani') ? ownUnitMode : inheritedUnit;
}

function entryUnitBadge(resolvedUnit) {
  if (resolvedUnit === 'mun') return ' <span style="font-size:10px;font-weight:700;background:#E3F2FD;color:#1565C0;padding:2px 6px;border-radius:8px;">MUN</span>';
  if (resolvedUnit === 'aani') return ' <span style="font-size:10px;font-weight:700;background:#F3E5F5;color:#7B1FA2;padding:2px 6px;border-radius:8px;">AANI</span>';
  return '';
}

async function renderEntry() {
  const content = document.getElementById('page-content');

  const [{ data: events }, { data: orgData }] = await Promise.all([
    db.from('dr_events')
      .select('*')
      .eq('is_live', true)
      .eq('org_id', currentOrgId)
      .order('created_at', { ascending: false }),
    db.from('dr_organizations').select('boli_unit_mode, rate_per_mun, rate_per_aani, split_receipt_threshold').eq('id', currentOrgId).single()
  ]);

  entryBoliMode = orgData?.boli_unit_mode || 'rupees';
  entryBoliRate = orgData?.rate_per_mun ?? null;
  entryAaniRate = orgData?.rate_per_aani ?? null;
  entrySplitThreshold = orgData?.split_receipt_threshold ?? 20000;

  currentCart = [];
  cartPayer = null;
  modalSelectedMember = null;

  content.innerHTML = `
    <div class="card">
      <div class="card-title">👤 Current Visit — Who's Donating?</div>
      <div class="form-group">
        <label>Donor Type</label>
        <select id="cart-donor-type" onchange="onCartDonorTypeChange()">
          <option value="">-- Select --</option>
          <option value="other">Other (Type Name)</option>
          <option value="member">Member (Search)</option>
        </select>
      </div>
      <div id="cart-other-fields" style="display:none;">
        <div class="form-group">
          <label>Name</label>
          <input type="text" id="cart-other-name" placeholder="Donor name" />
        </div>
        <div class="form-group">
          <label>Phone No. (10 digits — required, for collection follow-up)</label>
          <div style="display:flex;gap:4px;justify-content:center;margin-top:6px;" id="phone-boxes">
            ${[...Array(10)].map((_, i) => `
              <input type="tel" inputmode="numeric" maxlength="1"
                id="ph-${i}"
                oninput="phoneBoxInput(this,${i})"
                onkeydown="phoneBoxKey(event,${i})"
                onpaste="phoneBoxPaste(event,${i})"
                style="width:28px;height:36px;text-align:center;font-size:16px;font-weight:700;border:2px solid var(--border);border-radius:6px;outline:none;padding:0;"
              />
            `).join('')}
          </div>
          <input type="hidden" id="cart-other-phone" />
        </div>
      </div>
      <div id="cart-member-fields" style="display:none;">
        <div class="form-group">
          <label>Search Member</label>
          <input type="text" id="cart-member-search" placeholder="Type name or family no..." oninput="searchCartMember()" />
          <div id="cart-member-results" style="max-height:150px;overflow-y:auto;border:1px solid var(--border);border-radius:6px;margin-top:4px;display:none;"></div>
        </div>
        <div id="cart-selected-member" style="display:none;padding:8px;background:#FFF8F0;border-radius:6px;border:1.5px solid var(--accent);margin-bottom:8px;">
          <button class="btn-sm" style="float:right;background:#eee;color:#333;font-size:11px;" onclick="clearCartMember()">Change</button>
          <div><strong id="cart-selected-name"></strong> <span id="cart-selected-family" style="font-size:12px;color:var(--text-muted);"></span></div>
          <div id="cart-selected-phone" style="font-size:12px;margin-top:2px;"></div>
        </div>
      </div>
      <div class="form-group">
        <label>Receipt In Name Of</label>
        <select id="cart-receipt-name-select" style="display:none;margin-bottom:6px;" onchange="onCartReceiptNameSelectChange()"></select>
        <input type="text" id="cart-receipt-name" placeholder="e.g. a deceased family member's name" />
      </div>
    </div>

    <div class="card">
      <div class="card-title">🛒 This Visit's Items</div>
      <div id="cart-list"><p style="color:var(--text-muted);font-size:13px;">No items added yet — browse heads below and click "+ Add".</p></div>
      <div id="cart-actions" style="display:none;margin-top:10px;display:flex;gap:8px;flex-wrap:wrap;">
        <button class="btn-primary btn-sm" onclick="saveCartIndividually()">✅ Save Individually</button>
        <button class="btn-primary btn-sm" style="background:#7B1E3B;" onclick="generateTokenFromCart()">🎫 Generate Token</button>
      </div>
    </div>

    <div class="card">
      <div class="form-group">
        <label>Select Event</label>
        <select id="entry-event" onchange="onEntryEventChange()">
          <option value="">-- Select Live Event --</option>
          ${(events || []).map(ev => `<option value="${ev.id}">${ev.name}</option>`).join('')}
        </select>
        ${(!events || events.length === 0) ? '<p style="color:var(--danger);font-size:12px;margin-top:4px;">No live events. Admin needs to make an event live.</p>' : ''}
      </div>
    </div>

    <!-- Event Donation Heads -->
    <div id="event-heads-section" style="display:none;">
      <div class="card">
        <div class="section-header">
          <h3>🔶 Event Donation Heads</h3>
        </div>
        <div id="event-heads-list">Loading...</div>
      </div>
    </div>

    <!-- General Donation Heads -->
    <div class="card">
      <div class="section-header">
        <h3>🔷 General Donation Heads</h3>
      </div>
      <div id="general-heads-entry">Loading...</div>
    </div>

    <!-- Recent entries -->
    <div class="card">
      <div class="card-title">Recent Entries (This Session)</div>
      <div id="recent-entries"><p style="color:var(--text-muted);font-size:13px;">No entries yet this session.</p></div>
    </div>
  `;

  entryEventId = null;
  expandedEntryHeads = {};
  await loadGeneralHeadsEntry();
}

// ========== EVENT CHANGE ==========
async function onEntryEventChange() {
  entryEventId = document.getElementById('entry-event').value;
  expandedEntryHeads = {};
  if (!entryEventId) {
    document.getElementById('event-heads-section').style.display = 'none';
    return;
  }
  document.getElementById('event-heads-section').style.display = 'block';
  await loadEventHeadsEntry();
}

// ========== EVENT HEADS (3-level collapsible) ==========
async function loadEventHeadsEntry() {
  const el = document.getElementById('event-heads-list');
  if (!el) return;
  el.innerHTML = 'Loading...';

  const { data, error } = await db
    .from('dr_swapna')
    .select('*, dr_swapna_items(*)')
    .eq('event_id', entryEventId)
    .eq('org_id', currentOrgId)
    .order('sort_order');

  if (error || !data || data.length === 0) {
    el.innerHTML = `<div class="empty-state"><p>No heads found for this event.</p></div>`;
    return;
  }

  const topLevel = data.filter(s => !s.parent_id);
  const children = data.filter(s => s.parent_id);
  const rootUnit = entryBoliMode === 'mun' ? 'mun' : entryBoliMode === 'aani' ? 'aani' : 'rupees';

  el.innerHTML = topLevel.map(head => renderEntryMainHead(head, children, data, rootUnit)).join('');
}

function renderEntryMainHead(head, children, allData, rootUnit) {
  const isExpanded = expandedEntryHeads[head.id];
  const myChildren = children.filter(c => c.parent_id === head.id);
  const hasChildren = myChildren.length > 0;
  const hasItems = (head.dr_swapna_items || []).length > 0;
  const myUnit = entryEffectiveUnit(head.unit_mode, rootUnit);

  return `
    <div style="border:2px solid var(--primary);border-radius:10px;margin-bottom:10px;overflow:hidden;">
      <div style="display:flex;align-items:center;justify-content:space-between;padding:12px 16px;background:#ffffff;cursor:pointer;"
           onclick="toggleEntryHead('${head.id}')">
        <strong style="color:var(--primary);font-size:14px;">
          ${isExpanded ? '▼' : '▶'} ${head.name}${entryUnitBadge(myUnit)}
        </strong>
      </div>
      ${isExpanded ? `
        <div style="padding:8px 12px 12px 20px;">
          ${hasChildren ? myChildren.sort((a,b)=>(a.sort_order||0)-(b.sort_order||0))
            .map(child => renderEntryChildHead(child, allData, myUnit)).join('') : ''}
          ${hasItems ? renderEntrySwapnaItems(head, myUnit) : ''}
          ${!hasChildren && !hasItems ? renderEntryAddButton(head.id, head.name, 'swapna', myUnit) : ''}
        </div>
      ` : ''}
    </div>
  `;
}

function renderEntryChildHead(child, allData, inheritedUnit) {
  const isExpanded = expandedEntryHeads[child.id];
  const grandChildren = allData.filter(s => s.parent_id === child.id);
  const hasGrandChildren = grandChildren.length > 0;
  const hasItems = (child.dr_swapna_items || []).length > 0;
  const myUnit = entryEffectiveUnit(child.unit_mode, inheritedUnit);

  return `
    <div style="border:1.5px solid var(--border);border-radius:8px;margin-bottom:8px;overflow:hidden;">
      <div style="display:flex;align-items:center;justify-content:space-between;padding:10px 12px;background:#fafafa;cursor:pointer;"
           onclick="toggleEntryHead('${child.id}')">
        <span style="color:var(--primary);font-size:13px;font-weight:600;">
          ${isExpanded ? '▼' : '▶'} ${child.name}${entryUnitBadge(myUnit)}
        </span>
      </div>
      ${isExpanded ? `
        <div style="padding:6px 12px 10px 20px;">
          ${hasGrandChildren ? grandChildren.sort((a,b)=>(a.sort_order||0)-(b.sort_order||0))
            .map(gc => renderEntryLeafHead(gc, myUnit)).join('') : ''}
          ${hasItems ? renderEntrySwapnaItems(child, myUnit) : ''}
          ${!hasGrandChildren && !hasItems ? renderEntryAddButton(child.id, child.name, 'swapna', myUnit) : ''}
        </div>
      ` : ''}
    </div>
  `;
}

function renderEntryLeafHead(item, inheritedUnit) {
  const isExpanded = expandedEntryHeads[item.id];
  const hasItems = (item.dr_swapna_items || []).length > 0;
  const myUnit = entryEffectiveUnit(item.unit_mode, inheritedUnit);

  return `
    <div style="border:1px solid var(--border);border-radius:6px;margin-bottom:6px;overflow:hidden;">
      <div style="display:flex;align-items:center;justify-content:space-between;padding:8px 12px;background:#fff;cursor:pointer;"
           onclick="toggleEntryHead('${item.id}')">
        <span style="font-size:13px;color:var(--text);">
          ${isExpanded ? '▼' : '▶'} ${item.name}${entryUnitBadge(myUnit)}
        </span>
      </div>
      ${isExpanded ? `
        <div style="padding:6px 12px 8px 20px;">
          ${hasItems ? renderEntrySwapnaItems(item, myUnit) : renderEntryAddButton(item.id, item.name, 'swapna', myUnit)}
        </div>
      ` : ''}
    </div>
  `;
}

function renderEntrySwapnaItems(swapna, inheritedUnit) {
  const items = (swapna.dr_swapna_items || []).sort((a,b)=>(a.sort_order||0)-(b.sort_order||0));
  return items.map(item => {
    const myUnit = entryEffectiveUnit(item.unit_mode, inheritedUnit);
    return `
    <div style="padding:6px 0;display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid var(--border);">
      <span style="font-size:13px;">• ${item.name}${entryUnitBadge(myUnit)}</span>
      <button class="btn-accent btn-sm" onclick="showAddToCartModal('${item.id}','${(swapna.name+' → '+item.name).replace(/'/g,"\\'")}','swapna_item','${myUnit}')">+ Add</button>
    </div>
  `; }).join('');
}

function renderEntryAddButton(id, name, type, resolvedUnit) {
  return `
    <div style="padding:8px 0;">
      <button class="btn-accent btn-sm" onclick="showAddToCartModal('${id}','${name.replace(/'/g,"\\'")}','${type}','${resolvedUnit}')">+ Add Donation</button>
    </div>
  `;
}

async function toggleEntryHead(id) {
  expandedEntryHeads[id] = !expandedEntryHeads[id];
  await loadEventHeadsEntry();
}

// ========== GENERAL HEADS ENTRY ==========
async function loadGeneralHeadsEntry() {
  const { data, error } = await db
    .from('dr_general_heads')
    .select('*')
    .eq('org_id', currentOrgId)
    .order('display_order');

  const el = document.getElementById('general-heads-entry');
  if (!el) return;

  if (error || !data || data.length === 0) {
    el.innerHTML = `<p style="color:var(--text-muted);font-size:13px;">No general heads found.</p>`;
    return;
  }

  const rootUnit = entryBoliMode === 'mun' ? 'mun' : entryBoliMode === 'aani' ? 'aani' : 'rupees';
  const byId = {};
  data.forEach(h => { byId[h.id] = h; });
  const resolveGeneralUnit = h => {
    if (h.unit_mode === 'mun' || h.unit_mode === 'rupees' || h.unit_mode === 'aani') return h.unit_mode;
    const parent = h.parent_id ? byId[h.parent_id] : null;
    return parent ? resolveGeneralUnit(parent) : rootUnit;
  };

  el.innerHTML = data.map(h => {
    const myUnit = resolveGeneralUnit(h);
    return `
    <div style="display:flex;align-items:center;justify-content:space-between;padding:10px 0;border-bottom:1px solid var(--border);">
      <span style="font-size:14px;color:var(--text);">${h.name}${entryUnitBadge(myUnit)}</span>
      <button class="btn-accent btn-sm" onclick="showAddToCartModal('${h.id}','${h.name.replace(/'/g,"\\'")}','general','${myUnit}')">+ Add</button>
    </div>
  `; }).join('');
}

// ========== ADD-TO-CART MODAL (amount/qty only — donor is set once per visit) ==========
function showAddToCartModal(headId, headName, headType, unitMode) {
  const resolved = resolveHeadUnit(unitMode);

  showModal(`
    <div class="modal-title">+ Add to Cart</div>
    <div style="font-size:12px;color:var(--text-muted);margin-bottom:12px;">${headName}</div>

    ${resolved.mode === 'rupees' ? `
      <div class="form-group">
        <label>Amount (₹)</label>
        <input type="number" id="cart-item-amount" placeholder="0" min="1" inputmode="numeric" />
      </div>
    ` : `
      <div class="form-group">
        <label>Quantity (${resolved.mode === 'mun' ? 'Mun' : 'Aani'})</label>
        <input type="number" id="cart-item-qty" placeholder="0" min="0.01" step="0.01" inputmode="decimal" oninput="updateCartItemPreview()" />
        <div id="cart-item-preview" style="font-size:12px;color:var(--text-muted);margin-top:4px;">@ ₹${resolved.rate}/${resolved.mode}</div>
        <input type="hidden" id="cart-item-rate" value="${resolved.rate}" />
        <input type="hidden" id="cart-item-unit" value="${resolved.mode}" />
      </div>
    `}

    <div class="modal-actions">
      <button class="btn-primary" onclick="addToCart('${headId}','${headName.replace(/'/g,"\\'")}','${headType}','${resolved.mode}',${resolved.rate || 'null'})">+ Add</button>
      <button class="btn-secondary" onclick="closeModal()">Cancel</button>
    </div>
  `);
}

function updateCartItemPreview() {
  const previewEl = document.getElementById('cart-item-preview');
  const qtyInput = document.getElementById('cart-item-qty');
  if (!previewEl || !qtyInput) return;
  const rate = parseFloat(document.getElementById('cart-item-rate').value) || 0;
  const unit = document.getElementById('cart-item-unit').value;
  const qty = parseFloat(qtyInput.value) || 0;
  previewEl.textContent = `@ ₹${rate}/${unit} = ₹${(qty * rate).toLocaleString('en-IN')}`;
}

function addToCart(headId, headName, headType, unit, rate) {
  let amount, qty = null;
  if (unit === 'rupees') {
    amount = parseFloat(document.getElementById('cart-item-amount').value);
    if (!amount || amount <= 0) { showToast('Enter a valid amount', 'error'); return; }
  } else {
    qty = parseFloat(document.getElementById('cart-item-qty').value);
    if (!qty || qty <= 0) { showToast(`Enter a valid ${unit} quantity`, 'error'); return; }
    amount = qty * rate;
  }

  currentCart.push({ headId, headName, headType, amount, qty, unit, rate });
  closeModal();
  renderCartList();
}

function removeCartItem(index) {
  currentCart.splice(index, 1);
  renderCartList();
}

function renderCartList() {
  const listEl = document.getElementById('cart-list');
  const actionsEl = document.getElementById('cart-actions');
  if (!listEl) return;

  if (currentCart.length === 0) {
    listEl.innerHTML = `<p style="color:var(--text-muted);font-size:13px;">No items added yet — browse heads below and click "+ Add".</p>`;
    actionsEl.style.display = 'none';
    return;
  }

  const total = currentCart.reduce((s, c) => s + c.amount, 0);
  listEl.innerHTML = `
    <div style="overflow-x:auto;">
      <table class="data-table">
        <thead><tr><th>Head</th><th>Amount</th><th></th></tr></thead>
        <tbody>
          ${currentCart.map((c, i) => `
            <tr>
              <td style="font-size:13px;">${c.headName}${c.qty ? `<div style="font-size:11px;color:var(--text-muted);">${c.qty} ${c.unit}</div>` : ''}</td>
              <td><strong>${formatAmount(c.amount)}</strong></td>
              <td><button class="btn-sm btn-danger" onclick="removeCartItem(${i})">✕</button></td>
            </tr>
          `).join('')}
        </tbody>
        <tfoot><tr style="font-weight:700;"><td>Total</td><td>${formatAmount(total)}</td><td></td></tr></tfoot>
      </table>
    </div>
  `;
  actionsEl.style.display = 'flex';
}

// ========== CART-LEVEL DONOR SELECTION ==========
function onCartDonorTypeChange() {
  const type = document.getElementById('cart-donor-type').value;
  document.getElementById('cart-other-fields').style.display = type === 'other' ? 'block' : 'none';
  document.getElementById('cart-member-fields').style.display = type === 'member' ? 'block' : 'none';
  if (type !== 'member') clearCartMember();
}

function phoneBoxInput(el, index) {
  el.value = el.value.replace(/[^0-9]/g, "");
  if (el.value.length === 1 && index < 9) {
    document.getElementById("ph-" + (index + 1)).focus();
  }
  updateHiddenPhone();
}

function phoneBoxKey(e, index) {
  if (e.key === "Backspace") {
    const el = document.getElementById("ph-" + index);
    if (!el.value && index > 0) {
      document.getElementById("ph-" + (index - 1)).focus();
    }
    updateHiddenPhone();
  }
}

function phoneBoxPaste(e, startIndex) {
  e.preventDefault();
  const pasted = (e.clipboardData || window.clipboardData).getData("text").replace(/[^0-9]/g, "");
  for (let i = 0; i < pasted.length && (startIndex + i) < 10; i++) {
    document.getElementById("ph-" + (startIndex + i)).value = pasted[i];
  }
  updateHiddenPhone();
  const next = Math.min(startIndex + pasted.length, 9);
  document.getElementById("ph-" + next).focus();
}

function updateHiddenPhone() {
  let val = "";
  for (let i = 0; i < 10; i++) {
    const box = document.getElementById("ph-" + i);
    if (box) val += box.value;
  }
  const hidden = document.getElementById("cart-other-phone");
  if (hidden) hidden.value = val;
  for (let i = 0; i < 10; i++) {
    const box = document.getElementById("ph-" + i);
    if (box) box.style.borderColor = box.value ? "var(--primary)" : "var(--border)";
  }
}

let modalMemberTimer = null;
let modalSelectedMember = null;

function searchCartMember() {
  clearTimeout(modalMemberTimer);
  modalMemberTimer = setTimeout(async () => {
    const q = document.getElementById('cart-member-search').value.trim();
    const resultsEl = document.getElementById('cart-member-results');
    if (q.length < 1) { resultsEl.style.display = 'none'; return; }

    const { data } = await db
      .from('dr_members')
      .select('*')
      .eq('org_id', currentOrgId)
      .or(`person_name.ilike.%${q}%,family_no.ilike.%${q}%`)
      .limit(8);

    if (!data || data.length === 0) {
      resultsEl.innerHTML = '<p style="padding:8px;font-size:13px;color:var(--text-muted);">No members found.</p>';
      return;
    }

    resultsEl.style.display = 'block';
    resultsEl.innerHTML = data.map(m => `
      <div style="padding:8px 10px;cursor:pointer;border-bottom:1px solid var(--border);font-size:13px;"
           onmouseover="this.style.background='#FFF8F0'" onmouseout="this.style.background=''"
           onclick="selectCartMember('${m.id}','${m.person_name.replace(/'/g,"\\'")}','${m.family_no}','${(m.phone_no || '').replace(/'/g,"\\'")}')">
        <strong>${m.person_name}</strong>
        <span style="color:var(--text-muted);margin-left:6px;">Family: ${m.family_no}</span>
      </div>
    `).join('');
  }, 300);
}

async function selectCartMember(id, name, familyNo, phone) {
  modalSelectedMember = { id, name, familyNo, phone: phone || null };
  document.getElementById('cart-member-results').style.display = 'none';
  document.getElementById('cart-member-search').value = '';
  document.getElementById('cart-selected-member').style.display = 'block';
  document.getElementById('cart-selected-name').textContent = name;
  document.getElementById('cart-selected-family').textContent = 'Family: ' + familyNo;
  const phoneEl = document.getElementById('cart-selected-phone');
  if (phone) {
    phoneEl.style.color = 'var(--text-muted)';
    phoneEl.textContent = '📞 ' + phone;
  } else {
    phoneEl.style.color = '#D32F2F';
    phoneEl.textContent = '⚠ No phone on file for this member';
  }

  await loadCartReceiptNameOptions(familyNo);
}

async function loadCartReceiptNameOptions(familyNo) {
  const sel = document.getElementById('cart-receipt-name-select');
  const freeText = document.getElementById('cart-receipt-name');
  if (!sel) return;

  const { data: members } = await db.from('dr_family_individuals')
    .select('person_name').eq('org_id', currentOrgId).eq('family_no', familyNo)
    .order('is_head', { ascending: false });

  sel.innerHTML = `
    <option value="">-- Same as Donor --</option>
    ${(members || []).map(m => `<option value="${m.person_name.replace(/"/g, '&quot;')}">${m.person_name}</option>`).join('')}
    <option value="__other__">Other (type name below)</option>
  `;
  sel.style.display = 'block';
  freeText.style.display = 'none';
  freeText.value = '';
}

function onCartReceiptNameSelectChange() {
  const sel = document.getElementById('cart-receipt-name-select');
  const freeText = document.getElementById('cart-receipt-name');
  if (sel.value === '__other__') {
    freeText.style.display = 'block';
    freeText.value = '';
    freeText.focus();
  } else {
    freeText.style.display = 'none';
    freeText.value = '';
  }
}

function clearCartMember() {
  modalSelectedMember = null;
  document.getElementById('cart-selected-member').style.display = 'none';
  document.getElementById('cart-member-search').value = '';
  document.getElementById('cart-member-results').style.display = 'none';
  const sel = document.getElementById('cart-receipt-name-select');
  const freeText = document.getElementById('cart-receipt-name');
  sel.style.display = 'none';
  sel.innerHTML = '';
  freeText.style.display = 'block';
  freeText.value = '';
}

function getCartPayer() {
  const donorType = document.getElementById('cart-donor-type').value;
  if (donorType === 'other') {
    const name = document.getElementById('cart-other-name').value.trim();
    const phone = document.getElementById('cart-other-phone').value.trim();
    if (!name) { showToast('Enter donor name', 'error'); return null; }
    if (phone.length !== 10) { showToast('Enter a 10-digit phone number', 'error'); return null; }
    return { memberId: null, name, phone, familyNo: null };
  } else if (donorType === 'member') {
    if (!modalSelectedMember) { showToast('Select a member', 'error'); return null; }
    return { memberId: modalSelectedMember.id, name: modalSelectedMember.name, phone: modalSelectedMember.phone || null, familyNo: modalSelectedMember.familyNo };
  }
  showToast('Select donor type first', 'error');
  return null;
}

function getCartReceiptName() {
  const sel = document.getElementById('cart-receipt-name-select');
  if (sel && sel.style.display !== 'none' && sel.value && sel.value !== '__other__') {
    return sel.value;
  }
  return document.getElementById('cart-receipt-name').value.trim();
}

// ========== SAVE CART ==========
function buildCartRecords(payer, receiptName) {
  return currentCart.map(c => ({
    org_id: currentOrgId,
    event_id: c.headType !== 'general' ? entryEventId : null,
    head_type: c.headType === 'swapna_item' ? 'swapna_item' : c.headType === 'swapna' ? 'swapna' : 'general_head',
    swapna_item_id: c.headType === 'swapna_item' ? c.headId : null,
    swapna_id: c.headType === 'swapna' ? c.headId : null,
    general_head_id: c.headType === 'general' ? c.headId : null,
    member_id: payer.memberId,
    donor_name: payer.name,
    receipt_name: receiptName || null,
    family_no: payer.familyNo || null,
    phone: payer.phone || null,
    amount: c.amount,
    mun_qty: c.unit === 'mun' ? c.qty : null,
    rate_per_mun_used: c.unit === 'mun' ? c.rate : null,
    aani_qty: c.unit === 'aani' ? c.qty : null,
    rate_per_aani_used: c.unit === 'aani' ? c.rate : null,
    entered_by: currentUser?.id || null
  }));
}

async function saveCartIndividually() {
  if (currentCart.length === 0) { showToast('Add at least one item first', 'error'); return; }
  const payer = getCartPayer();
  if (!payer) return;
  const receiptName = getCartReceiptName();

  const records = buildCartRecords(payer, receiptName);
  const { data: saved, error } = await db.from('dr_donations').insert(records).select();
  if (error) { showToast('Error: ' + error.message, 'error'); return; }

  showToast(`✅ Saved ${saved.length} entries totalling ${formatAmount(currentCart.reduce((s,c)=>s+c.amount,0))}`, 'success');
  lastSavedDonationId = saved[saved.length - 1].id;

  saved.forEach((s, i) => recentEntries.unshift({ id: s.id, donor: s.donor_name, family: s.family_no || '—', phone: s.phone || '—', head: currentCart[i]?.headName || '—', amount: s.amount, munQty: s.mun_qty }));
  updateRecentEntries();

  currentCart = [];
  renderCartList();
  await loadGeneralHeadsEntry();
  if (entryEventId) await loadEventHeadsEntry();
}

async function generateTokenFromCart() {
  if (currentCart.length === 0) { showToast('Add at least one item first', 'error'); return; }
  const payer = getCartPayer();
  if (!payer) return;
  const receiptName = getCartReceiptName();
  const total = currentCart.reduce((s, c) => s + c.amount, 0);

  const { data: token, error: tErr } = await db.from('dr_receipt_tokens').insert({
    org_id: currentOrgId,
    member_id: payer.memberId,
    payer_name: payer.name,
    phone: payer.phone,
    family_no: payer.familyNo,
    total_amount: total,
    created_by: currentUser?.id || null,
    status: 'pending'
  }).select().single();
  if (tErr) { showToast('Error: ' + tErr.message, 'error'); return; }

  const records = buildCartRecords(payer, receiptName).map(r => ({ ...r, token_id: token.id }));
  const { error: dErr } = await db.from('dr_donations').insert(records);
  if (dErr) { showToast('Error: ' + dErr.message, 'error'); return; }

  showToast(`🎫 Token issued for ${formatAmount(total)} — give the slip to the donor`, 'success');
  showTokenSlip(token.id);

  currentCart = [];
  renderCartList();
  await loadGeneralHeadsEntry();
  if (entryEventId) await loadEventHeadsEntry();
}

function updateRecentEntries() {
  const el = document.getElementById('recent-entries');
  if (!el || recentEntries.length === 0) return;
  el.innerHTML = `
    <div style="overflow-x:auto;">
      <table class="data-table">
        <thead>
          <tr><th>Donor</th><th>Phone</th><th>Head</th><th>Amount</th><th>Actions</th></tr>
        </thead>
        <tbody>
          ${recentEntries.slice(0, 10).map(e => `
            <tr>
              <td>${e.donor}</td>
              <td>${e.phone || '—'}</td>
              <td style="font-size:12px;">${e.head}</td>
              <td><strong>${formatAmount(e.amount)}</strong>${e.munQty ? `<div style="font-size:11px;color:var(--text-muted);">${e.munQty} mun</div>` : ''}</td>
              <td>
                <div style="display:flex;gap:4px;">
                  <button class="btn-sm btn-secondary" onclick="showDonationReceipt('${e.id}')">🧾</button>
                  <button class="btn-sm" style="background:#25D366;color:white;" onclick="whatsappDonation('${e.id}')">📲</button>
                  ${isAdmin() ? `<button class="btn-sm btn-danger" onclick="deleteDonation('${e.id}','entry')">✕</button>` : ''}
                </div>
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;
}

function whatsappDonation(id) {
  const e = recentEntries.find(r => r.id === id);
  if (!e) return;
  const msg = `🛕 *Derasar Boli - Pending Donation*\n\n` +
    `👤 Donor: ${e.donor}\n` +
    `📱 Phone: ${e.phone || '—'}\n` +
    `🏠 Family: ${e.family || '—'}\n` +
    `📋 Head: ${e.head}\n` +
    `💰 Amount Pledged: ${formatAmount(e.amount)}${e.munQty ? ' (' + e.munQty + ' mun)' : ''}\n` +
    `⏳ Payment Pending — kindly complete at your earliest convenience.\n\n` +
    `🙏 Jai Jinendra`;
  window.open('https://wa.me/?text=' + encodeURIComponent(msg), '_blank');
}

function printLastReceipt() {
  if (lastSavedDonationId) showDonationReceipt(lastSavedDonationId);
}

// ========== EDIT / DELETE DONATIONS ==========
async function showEditDonationModal(id, refreshFn) {
  const { data: d, error } = await db.from('dr_donations').select('*').eq('id', id).eq('org_id', currentOrgId).single();
  if (error || !d) { showToast('Could not load', 'error'); return; }

  showModal(`
    <div class="modal-title">Edit Donation</div>
    <div style="font-size:13px;color:var(--text-muted);margin-bottom:14px;">
      <strong>${d.donor_name}</strong>${d.family_no ? ' · Family: ' + d.family_no : ''}
    </div>
    <div class="form-group">
      <label>Donor Name</label>
      <input type="text" id="edit-don-name" value="${d.donor_name || ''}" />
    </div>
    <div class="form-group">
      <label>Phone</label>
      <input type="tel" id="edit-don-phone" value="${d.phone || ''}" placeholder="Mobile number" />
    </div>
    <div class="form-group">
      <label>Receipt In Name Of (optional)</label>
      <input type="text" id="edit-don-receipt-name" value="${d.receipt_name || ''}" placeholder="Leave blank to use donor's name" />
    </div>
    ${d.mun_qty ? `
      <div class="form-group">
        <label>Quantity (Mun)</label>
        <input type="number" id="edit-don-mun-qty" value="${d.mun_qty}" min="0.01" step="0.01" />
        <div style="font-size:12px;color:var(--text-muted);margin-top:4px;">@ ₹${d.rate_per_mun_used}/mun</div>
        <input type="hidden" id="edit-don-mun-rate" value="${d.rate_per_mun_used}" />
      </div>
    ` : d.aani_qty ? `
      <div class="form-group">
        <label>Quantity (Aani)</label>
        <input type="number" id="edit-don-aani-qty" value="${d.aani_qty}" min="0.01" step="0.01" />
        <div style="font-size:12px;color:var(--text-muted);margin-top:4px;">@ ₹${d.rate_per_aani_used}/aani</div>
        <input type="hidden" id="edit-don-aani-rate" value="${d.rate_per_aani_used}" />
      </div>
    ` : `
      <div class="form-group">
        <label>Amount</label>
        <input type="number" id="edit-don-amount" value="${d.amount}" min="1" />
      </div>
    `}
    <div class="modal-actions">
      <button class="btn-primary" onclick="updateDonation('${id}','${refreshFn}')">Update</button>
      <button class="btn-secondary" onclick="closeModal()">Cancel</button>
    </div>
  `);
}

async function updateDonation(id, refreshFn) {
  const donor_name = document.getElementById('edit-don-name').value.trim();
  const phone = document.getElementById('edit-don-phone').value.trim();
  const receipt_name = document.getElementById('edit-don-receipt-name').value.trim();

  const munQtyInput = document.getElementById('edit-don-mun-qty');
  const aaniQtyInput = document.getElementById('edit-don-aani-qty');
  const update = { donor_name, phone: phone || null, receipt_name: receipt_name || null };

  if (munQtyInput) {
    const munQty = parseFloat(munQtyInput.value);
    const rate = parseFloat(document.getElementById('edit-don-mun-rate').value);
    if (!munQty || munQty <= 0) { showToast('Enter valid mun quantity', 'error'); return; }
    update.mun_qty = munQty;
    update.amount = munQty * rate;
  } else if (aaniQtyInput) {
    const aaniQty = parseFloat(aaniQtyInput.value);
    const rate = parseFloat(document.getElementById('edit-don-aani-rate').value);
    if (!aaniQty || aaniQty <= 0) { showToast('Enter valid aani quantity', 'error'); return; }
    update.aani_qty = aaniQty;
    update.amount = aaniQty * rate;
  } else {
    const amount = parseFloat(document.getElementById('edit-don-amount').value);
    if (!amount || amount <= 0) { showToast('Enter valid amount', 'error'); return; }
    update.amount = amount;
  }

  const { error } = await db.from('dr_donations')
    .update(update)
    .eq('id', id).eq('org_id', currentOrgId);
  if (error) { showToast('Error: ' + error.message, 'error'); return; }

  closeModal();
  showToast('Donation updated!', 'success');
  if (refreshFn === 'live') loadLiveData();
  else if (refreshFn === 'reports') loadReport();
}

async function deleteDonation(id, refreshFn) {
  if (!confirm('Delete this donation entry? This cannot be undone.')) return;
  const { error } = await db.from('dr_donations').delete().eq('id', id).eq('org_id', currentOrgId);
  if (error) { showToast('Error: ' + error.message, 'error'); return; }
  showToast('Donation deleted');
  if (refreshFn === 'live') loadLiveData();
  else if (refreshFn === 'reports') loadReport();
  else if (refreshFn === 'entry') {
    recentEntries = recentEntries.filter(e => e.id !== id);
    updateRecentEntries();
  }
}
