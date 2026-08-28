// ==========================================
// DERASAR BOLI - Split Receipt Rows
// Shared "name + amount rows, must sum to total" widget used by both
// the donation-entry "Split now" flow (js/donations.js) and the
// admin "Pending Tokens" allocation screen (js/tokens.js).
// ==========================================

let splitRowsState = {};

// familyNo is optional — when present, "+ Add family member" is offered.
function renderSplitRows(containerId, totalAmount, familyNo) {
  splitRowsState[containerId] = { totalAmount, familyNo: familyNo || null, rows: [] };
  return `
    <div id="${containerId}">
      <div id="${containerId}-rows"></div>
      <div style="display:flex;gap:8px;margin:8px 0;">
        ${familyNo ? `<button class="btn-sm btn-secondary" onclick="addFamilyMemberRows('${containerId}','${familyNo}')">+ Add Family Member</button>` : ''}
        <button class="btn-sm btn-secondary" onclick="addOtherNameRow('${containerId}')">+ Add Other Name</button>
      </div>
      <div id="${containerId}-fampicker" style="display:none;"></div>
      <div id="${containerId}-sum" style="font-size:13px;font-weight:600;margin-top:4px;"></div>
    </div>
  `;
}

function splitRowsRedraw(containerId) {
  const state = splitRowsState[containerId];
  const rowsEl = document.getElementById(containerId + '-rows');
  if (!rowsEl || !state) return;

  rowsEl.innerHTML = state.rows.map((r, i) => `
    <div style="display:flex;gap:6px;align-items:center;margin-bottom:6px;">
      <input type="text" value="${(r.name || '').replace(/"/g, '&quot;')}" placeholder="Name"
        oninput="splitRowUpdate('${containerId}',${i},'name',this.value)" style="flex:2;" />
      <input type="number" value="${r.amount || ''}" placeholder="₹" min="1"
        oninput="splitRowUpdate('${containerId}',${i},'amount',this.value)" style="flex:1;" />
      <button class="btn-sm btn-danger" onclick="splitRowRemove('${containerId}',${i})">✕</button>
    </div>
  `).join('');

  splitRowsUpdateSum(containerId);
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
  state.rows.push({ name: '', amount: '', memberId: null, familyNo: null });
  splitRowsRedraw(containerId);
}

// Renders inline (not a nested modal — this app has a single modal-box, and the
// split-rows UI already lives inside one; opening another showModal() here would
// wipe out the donation-entry modal that's currently open).
async function addFamilyMemberRows(containerId, familyNo) {
  const state = splitRowsState[containerId];
  if (!state) return;

  const { data: members, error } = await db.from('dr_family_individuals')
    .select('*').eq('org_id', currentOrgId).eq('family_no', familyNo)
    .order('is_head', { ascending: false });

  if (error || !members || members.length === 0) {
    showToast('No family members found for this family', 'error');
    return;
  }

  state.familyMembers = members;
  const pickerEl = document.getElementById(containerId + '-fampicker');
  if (!pickerEl) return;

  pickerEl.style.display = 'block';
  pickerEl.innerHTML = `
    <div style="border:1.5px solid var(--accent);border-radius:8px;padding:10px;margin-bottom:8px;background:#FFF8F0;">
      <div style="font-size:13px;font-weight:600;margin-bottom:6px;">Pick Family Member(s)</div>
      ${members.map((m, i) => `
        <label style="display:flex;align-items:center;gap:8px;padding:6px 0;border-bottom:1px solid var(--border);font-size:13px;">
          <input type="checkbox" id="fam-pick-${containerId}-${i}" />
          <span>${m.person_name}${m.is_head ? ' (Head)' : ''}</span>
        </label>
      `).join('')}
      <div style="display:flex;gap:8px;margin-top:8px;">
        <button class="btn-sm btn-primary" onclick="confirmFamilyMemberPick('${containerId}')">Add Selected</button>
        <button class="btn-sm btn-secondary" onclick="document.getElementById('${containerId}-fampicker').style.display='none'">Cancel</button>
      </div>
    </div>
  `;
}

function confirmFamilyMemberPick(containerId) {
  const state = splitRowsState[containerId];
  if (!state || !state.familyMembers) return;

  state.familyMembers.forEach((m, i) => {
    const cb = document.getElementById(`fam-pick-${containerId}-${i}`);
    if (cb && cb.checked) {
      // m.id is a dr_family_individuals id, not a dr_members id (which is
      // head-only) — never store it as dr_donations.member_id, that FK
      // points at dr_members. family_no alone is enough to attribute the split.
      state.rows.push({ name: m.person_name, amount: '', memberId: null, familyNo: m.family_no });
    }
  });

  const pickerEl = document.getElementById(containerId + '-fampicker');
  if (pickerEl) { pickerEl.style.display = 'none'; pickerEl.innerHTML = ''; }
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
