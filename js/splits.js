// ==========================================
// DERASAR BOLI - Split Receipt Rows
// Shared "name + amount rows, must sum to total" widget used by both
// the donation-entry "Split now" flow (js/donations.js) and the
// admin token-allocation screen (js/tokens.js).
// ==========================================

let splitRowsState = {};

// familyNo/payerName are optional — when present, every row's name field
// offers the payer's own name + family members as dropdown picks, with
// manual typing always available too (as the first/default option).
function renderSplitRows(containerId, totalAmount, familyNo, payerName) {
  splitRowsState[containerId] = { totalAmount, familyNo: familyNo || null, payerName: payerName || null, familyMembers: [], rows: [] };

  // Fire the family-member fetch now (if we have a family) so every row's
  // dropdown has options ready by the time it first renders.
  if (familyNo) loadFamilyMembersForState(containerId, familyNo);

  return `
    <div id="${containerId}">
      <div style="display:flex;gap:6px;align-items:center;margin-bottom:8px;padding:8px;background:#f5f5f5;border-radius:8px;">
        <span style="font-size:12px;color:var(--text-muted);">No. of split receipts:</span>
        <input type="number" id="${containerId}-splitcount" min="2" placeholder="e.g. 5" style="width:60px;" />
        <button class="btn-sm btn-secondary" onclick="generateEqualSplitRows('${containerId}')">Generate Rows</button>
      </div>
      <div id="${containerId}-rows"></div>
      <div style="margin:8px 0;">
        <button class="btn-sm btn-secondary" onclick="addOtherNameRow('${containerId}')">+ Add Row</button>
      </div>
      <div id="${containerId}-sum" style="font-size:13px;font-weight:600;margin-top:4px;"></div>
    </div>
  `;
}

async function loadFamilyMembersForState(containerId, familyNo) {
  const { data: members } = await db.from('dr_family_individuals')
    .select('*').eq('org_id', currentOrgId).eq('family_no', familyNo)
    .order('is_head', { ascending: false });

  const state = splitRowsState[containerId];
  if (!state) return;
  state.familyMembers = members || [];
  splitRowsRedraw(containerId);
}

// Every row's name dropdown: manual entry first (the default/fallback),
// then the payer's own name, then the rest of their family.
function nameDropdownOptions(state, row) {
  const opts = [`<option value="__manual__" ${row.isManual ? 'selected' : ''}>✍️ Type Manually</option>`];
  if (state.payerName) {
    opts.push(`<option value="${state.payerName.replace(/"/g,'&quot;')}" ${!row.isManual && row.name === state.payerName ? 'selected' : ''}>${state.payerName} (Payer)</option>`);
  }
  (state.familyMembers || []).forEach(m => {
    if (m.person_name === state.payerName) return; // don't list the payer twice
    opts.push(`<option value="${m.person_name.replace(/"/g,'&quot;')}" ${!row.isManual && row.name === m.person_name ? 'selected' : ''}>${m.person_name}${m.is_head ? ' (Head)' : ''}</option>`);
  });
  return opts.join('');
}

// Pre-fills N rows with an equal share of the total (last row absorbs the
// rounding remainder so the sum stays exact) — admin then picks/types names
// and can freely adjust amounts afterward as long as the total still matches.
function generateEqualSplitRows(containerId) {
  const state = splitRowsState[containerId];
  if (!state) return;

  const n = parseInt(document.getElementById(containerId + '-splitcount')?.value, 10);
  if (!n || n < 2) { showToast('Enter how many receipts to split into (2 or more)', 'error'); return; }

  const total = parseFloat(state.totalAmount);
  const share = Math.floor(total / n);
  const remainder = total - share * n;

  state.rows = [];
  for (let i = 0; i < n; i++) {
    state.rows.push({ name: '', amount: share + (i === n - 1 ? remainder : 0), memberId: null, familyNo: null, isManual: true });
  }
  splitRowsRedraw(containerId);
}

function splitRowsRedraw(containerId) {
  const state = splitRowsState[containerId];
  const rowsEl = document.getElementById(containerId + '-rows');
  if (!rowsEl || !state) return;

  rowsEl.innerHTML = state.rows.map((r, i) => `
    <div style="margin-bottom:6px;">
      <div style="display:flex;gap:6px;align-items:center;">
        <select onchange="splitRowNameSelect('${containerId}',${i},this.value)" style="flex:2;">
          ${nameDropdownOptions(state, r)}
        </select>
        <input type="number" value="${r.amount || ''}" placeholder="₹" min="1"
          oninput="splitRowUpdate('${containerId}',${i},'amount',this.value)" style="flex:1;" />
        <button class="btn-sm btn-danger" onclick="splitRowRemove('${containerId}',${i})">✕</button>
      </div>
      ${r.isManual ? `
        <input type="text" value="${(r.name || '').replace(/"/g, '&quot;')}" placeholder="Type name"
          oninput="splitRowUpdate('${containerId}',${i},'name',this.value)" style="width:100%;margin-top:4px;" />
      ` : ''}
    </div>
  `).join('');

  splitRowsUpdateSum(containerId);
}

function splitRowNameSelect(containerId, index, value) {
  const state = splitRowsState[containerId];
  if (!state || !state.rows[index]) return;
  const row = state.rows[index];

  if (value === '__manual__') {
    row.isManual = true;
    row.name = '';
    row.familyNo = null;
  } else {
    row.isManual = false;
    row.name = value;
    // Payer or a family member — either way it's the same family for attribution.
    row.familyNo = state.familyNo || null;
  }
  splitRowsRedraw(containerId);
}

function splitRowsUpdateSum(containerId) {
  const state = splitRowsState[containerId];
  const sumEl = document.getElementById(containerId + '-sum');
  if (!sumEl || !state) return;

  const sum = state.rows.reduce((s, r) => s + (parseFloat(r.amount) || 0), 0);
  const ok = Math.abs(sum - parseFloat(state.totalAmount)) < 0.01;
  sumEl.style.color = ok ? '#2E7D32' : '#D32F2F';
  sumEl.textContent = `Total so far: ₹${sum.toLocaleString('en-IN')} / ₹${parseFloat(state.totalAmount).toLocaleString('en-IN')} required` + (ok ? ' ✓' : '');
}

function splitRowUpdate(containerId, index, field, value) {
  const state = splitRowsState[containerId];
  if (!state || !state.rows[index]) return;
  state.rows[index][field] = value;
  splitRowsUpdateSum(containerId);
}

function splitRowRemove(containerId, index) {
  const state = splitRowsState[containerId];
  if (!state) return;
  state.rows.splice(index, 1);
  splitRowsRedraw(containerId);
}

function addOtherNameRow(containerId) {
  const state = splitRowsState[containerId];
  if (!state) return;
  state.rows.push({ name: '', amount: '', memberId: null, familyNo: null, isManual: true });
  splitRowsRedraw(containerId);
}

// Returns rows array if valid (sum matches total, all names filled), else null (and toasts the error).
function readSplitRows(containerId) {
  const state = splitRowsState[containerId];
  if (!state) return null;

  if (state.rows.length < 2) { showToast('Add at least 2 names to split the receipt', 'error'); return null; }

  for (const r of state.rows) {
    if (!r.name || !r.name.trim()) { showToast('Every row needs a name', 'error'); return null; }
    if (!r.amount || parseFloat(r.amount) <= 0) { showToast('Every row needs a valid amount', 'error'); return null; }
  }

  const sum = state.rows.reduce((s, r) => s + parseFloat(r.amount), 0);
  if (Math.abs(sum - parseFloat(state.totalAmount)) >= 0.01) {
    showToast('Split amounts must add up to the total exactly', 'error');
    return null;
  }

  return state.rows.map(r => ({ name: r.name.trim(), amount: parseFloat(r.amount), memberId: r.memberId || null, familyNo: r.familyNo || null }));
}
