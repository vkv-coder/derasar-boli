// ==========================================
// DERASAR BOLI - Function / Event Entry Passes
// ==========================================
// Admin creates a "function" (lunch/gift event) with a date, and can set
// how many of a family's members are pre-registered/allowed in for it —
// e.g. family of 6, but only 2 confirmed/paid, admin writes 2, and that's
// what shows at the gate (scanning the Membership Card QR, or via the
// Members list). Functions past their date drop out of every list here
// automatically (event_date >= today) — nothing is deleted.

function todayISO() {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

async function loadActiveFunctions() {
  const { data, error } = await db.from('dr_functions')
    .select('*').eq('org_id', currentOrgId).gte('event_date', todayISO()).order('event_date');
  if (error) { console.error(error); return []; }
  return data || [];
}

// ---------- Admin: manage functions (Heads Setup screen) ----------
async function loadFunctionsList() {
  const el = document.getElementById('functions-list');
  if (!el) return;
  const functions = await loadActiveFunctions();
  if (functions.length === 0) {
    el.innerHTML = `<p style="font-size:12px;color:var(--text-muted);">No upcoming events. Add one below.</p>`;
    return;
  }

  const passRows = await Promise.all(functions.map(f =>
    db.from('dr_function_passes').select('allowed_count, total_amount').eq('org_id', currentOrgId).eq('function_id', f.id)
      .then(({ data }) => data || [])
  ));
  const totals = passRows.map(rows => rows.reduce((s, r) => s + (r.allowed_count || 0), 0));
  const amountTotals = passRows.map(rows => rows.reduce((s, r) => s + (parseFloat(r.total_amount) || 0), 0));

  el.innerHTML = functions.map((f, i) => `
    <div style="display:flex;justify-content:space-between;align-items:center;border:1.5px solid var(--border);border-radius:8px;padding:8px 12px;margin-bottom:6px;">
      <div>
        <strong>${f.name}</strong> ${f.is_free ? '<span style="font-size:10px;color:var(--text-muted);">FREE</span>' : `<span style="font-size:10px;color:var(--primary);">₹${f.amount_per_person}/person</span>`}
        <div style="font-size:11px;color:var(--text-muted);">${new Date(f.event_date + 'T00:00:00').toLocaleDateString('en-IN', { day:'numeric', month:'short', year:'numeric' })}</div>
      </div>
      <div style="display:flex;align-items:center;gap:10px;">
        <div style="text-align:center;">
          <div style="font-size:18px;font-weight:800;color:var(--primary);">${totals[i]}</div>
          <div style="font-size:9px;color:var(--text-muted);">PERSONS</div>
        </div>
        ${!f.is_free ? `
        <div style="text-align:center;">
          <div style="font-size:14px;font-weight:800;color:#2E7D32;">₹${amountTotals[i].toLocaleString('en-IN')}</div>
          <div style="font-size:9px;color:var(--text-muted);">COLLECTED</div>
        </div>` : ''}
        <button class="btn-sm btn-secondary" onclick="showFunctionReport('${f.id}')" title="Report">📊</button>
        <button class="btn-sm btn-danger" onclick="deleteFunction('${f.id}')">Del</button>
      </div>
    </div>
  `).join('');
}

function showAddFunctionModal() {
  showModal(`
    <div class="modal-header"><h3>🎟 Add Event Pass</h3></div>
    <div class="form-group">
      <label>Event Name</label>
      <input type="text" id="fn-name-input" placeholder="e.g. Diwali Snehmilan / Swamivatsalya" />
    </div>
    <div class="form-group">
      <label>Event Date</label>
      <input type="date" id="fn-date-input" value="${todayISO()}" />
    </div>
    <div class="form-group">
      <label>Free or Paid</label>
      <select id="fn-free-input" onchange="document.getElementById('fn-amount-row').style.display=this.value==='paid'?'block':'none';">
        <option value="free">Free (e.g. Nisal Garva)</option>
        <option value="paid">Paid (e.g. Swamivatsalya token amount)</option>
      </select>
    </div>
    <div class="form-group" id="fn-amount-row" style="display:none;">
      <label>Amount per Person (₹)</label>
      <input type="number" id="fn-amount-input" min="1" step="0.01" placeholder="e.g. 50" />
    </div>
    <button class="btn-primary" onclick="saveNewFunction()">Save</button>
  `);
}

async function saveNewFunction() {
  const name = document.getElementById('fn-name-input').value.trim();
  const eventDate = document.getElementById('fn-date-input').value;
  const isFree = document.getElementById('fn-free-input').value === 'free';
  const amountPerPerson = isFree ? null : parseFloat(document.getElementById('fn-amount-input')?.value);
  if (!name || !eventDate) { showToast('Enter name and date', 'error'); return; }
  if (!isFree && (!amountPerPerson || amountPerPerson <= 0)) { showToast('Enter a valid amount per person', 'error'); return; }
  const { error } = await db.from('dr_functions').insert({ org_id: currentOrgId, name, event_date: eventDate, is_free: isFree, amount_per_person: amountPerPerson });
  if (error) { showToast('Error: ' + error.message, 'error'); return; }
  showToast('✅ Event pass added!', 'success');
  closeModal();
  await loadFunctionsList();
}

async function deleteFunction(id) {
  if (!confirm('Delete this event pass? Any saved pass counts for it will also be removed.')) return;
  const { error } = await db.from('dr_functions').delete().eq('id', id).eq('org_id', currentOrgId);
  if (error) { showToast('Error: ' + error.message, 'error'); return; }
  showToast('Deleted', 'success');
  await loadFunctionsList();
}

// ---------- Shared: per-family pass counts for all active functions ----------
// Used both from the Members list (pre-registration) and the QR-linked
// family view (gate check). memberCount is shown alongside each input
// as a reminder of the family's total size.
async function buildFamilyPassesHTML(familyNo, memberCount) {
  const [functions, { data: passes }] = await Promise.all([
    loadActiveFunctions(),
    db.from('dr_function_passes').select('*').eq('org_id', currentOrgId).eq('family_no', familyNo)
  ]);

  if (functions.length === 0) {
    return `<p style="font-size:12px;color:var(--text-muted);">No upcoming events.</p>`;
  }

  const passMap = {};
  (passes || []).forEach(p => { passMap[p.function_id] = p; });

  return functions.map(f => {
    const pass = passMap[f.id];
    const count = pass ? pass.allowed_count : '';

    // Free functions keep the original one-field, auto-save-on-change flow
    // (low friction for gate-keeping headcounts, which is all they need).
    if (f.is_free) {
      return `
      <div style="display:flex;justify-content:space-between;align-items:center;border:1.5px solid var(--border);border-radius:8px;padding:8px 12px;margin-bottom:6px;">
        <div>
          <strong style="font-size:13px;">${f.name}</strong> <span style="font-size:10px;color:var(--text-muted);">FREE</span>
          <div style="font-size:11px;color:var(--text-muted);">${new Date(f.event_date + 'T00:00:00').toLocaleDateString('en-IN', { day:'numeric', month:'short', year:'numeric' })} · Family has ${memberCount} member${memberCount === 1 ? '' : 's'}</div>
        </div>
        <input type="number" min="0" max="${memberCount}" value="${count}" placeholder="0"
          style="width:64px;padding:5px 6px;border:1.5px solid var(--border);border-radius:6px;font-size:14px;font-weight:700;text-align:center;"
          onchange="saveFamilyPass('${f.id}', '${familyNo.replace(/'/g, "\\'")}', this.value)" />
      </div>`;
    }

    // Paid functions need persons + payment mode before there's anything
    // sensible to save, plus a live total and (once saved) a receipt.
    const rowId = 'fp-' + f.id;
    return `
    <div style="border:1.5px solid var(--border);border-radius:8px;padding:8px 12px;margin-bottom:6px;">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;">
        <div>
          <strong style="font-size:13px;">${f.name}</strong> <span style="font-size:10px;color:var(--primary);">₹${f.amount_per_person}/person</span>
          <div style="font-size:11px;color:var(--text-muted);">${new Date(f.event_date + 'T00:00:00').toLocaleDateString('en-IN', { day:'numeric', month:'short', year:'numeric' })} · Family has ${memberCount} member${memberCount === 1 ? '' : 's'}</div>
        </div>
        <input type="number" id="${rowId}-count" min="0" max="${memberCount}" value="${count}" placeholder="0"
          style="width:56px;padding:5px 6px;border:1.5px solid var(--border);border-radius:6px;font-size:14px;font-weight:700;text-align:center;"
          oninput="document.getElementById('${rowId}-total').textContent = '₹' + ((parseInt(this.value)||0) * ${f.amount_per_person}).toLocaleString('en-IN');" />
      </div>
      <div style="display:flex;justify-content:space-between;align-items:center;margin-top:8px;gap:8px;flex-wrap:wrap;">
        <select id="${rowId}-mode" style="padding:5px 6px;border:1.5px solid var(--border);border-radius:6px;font-size:12px;">
          <option value="cash" ${!pass || pass.payment_mode !== 'online' ? 'selected' : ''}>💵 Cash</option>
          <option value="online" ${pass && pass.payment_mode === 'online' ? 'selected' : ''}>📱 Online</option>
        </select>
        <span id="${rowId}-total" style="font-weight:800;color:#2E7D32;">₹${((count || 0) * f.amount_per_person).toLocaleString('en-IN')}</span>
        <button class="btn-sm btn-primary" onclick="saveFamilyPass('${f.id}', '${familyNo.replace(/'/g, "\\'")}', document.getElementById('${rowId}-count').value, document.getElementById('${rowId}-mode').value)">💾 Save</button>
        ${pass && pass.receipt_no ? `<button class="btn-sm btn-secondary" onclick="showFunctionPassReceipt('${pass.id}')" title="Print">🖨 #${pass.receipt_no}</button>` : ''}
      </div>
    </div>`;
  }).join('');
}

async function saveFamilyPass(functionId, familyNo, value, paymentMode) {
  const count = value === '' ? 0 : Math.max(0, parseInt(value, 10) || 0);
  const { data: fn } = await db.from('dr_functions').select('is_free, amount_per_person').eq('id', functionId).single();

  const upsertObj = { org_id: currentOrgId, function_id: functionId, family_no: familyNo, allowed_count: count, updated_at: new Date().toISOString() };
  if (fn && !fn.is_free) {
    upsertObj.total_amount = count * (fn.amount_per_person || 0);
    upsertObj.payment_mode = paymentMode || 'cash';
  }

  const { data: saved, error } = await db.from('dr_function_passes')
    .upsert(upsertObj, { onConflict: 'function_id,family_no' })
    .select().single();
  if (error) { showToast('Error: ' + error.message, 'error'); return; }

  // Assign a receipt the first time this becomes a genuine paid pass -
  // reuses the existing number on later edits (getOrAssignReceiptNo already
  // no-ops once receipt_no is set), so editing the count afterward doesn't
  // mint a second receipt for the same family/event.
  if (fn && !fn.is_free && count > 0 && !saved.receipt_no) {
    await getOrAssignReceiptNo('dr_function_passes', saved);
  }

  showToast('✅ Passes saved: ' + count, 'success');
  // Refresh just the list in place (not the whole modal) so it doesn't need
  // headName again and doesn't flicker - same pattern used for the free-
  // function inputs, just also needed here now that paid rows show a
  // receipt button that only appears after this save. Used from two
  // different screens (Members list modal and the QR-linked gate view),
  // each with their own container id.
  const listEl = document.getElementById('family-pass-list') || document.getElementById('family-pass-section');
  if (listEl) {
    const { data: famMembers } = await db.from('dr_members').select('id').eq('org_id', currentOrgId).eq('family_no', familyNo);
    listEl.innerHTML = await buildFamilyPassesHTML(familyNo, (famMembers || []).length);
  }
}

// ---------- Admin: per-event report (who's coming, who paid what) ----------
let lastFunctionReportRows = [];
let lastFunctionReportName = '';

async function showFunctionReport(functionId) {
  const { data: fn } = await db.from('dr_functions').select('*').eq('id', functionId).single();
  if (!fn) { showToast('Event pass not found', 'error'); return; }

  const { data: passes } = await db.from('dr_function_passes')
    .select('*').eq('org_id', currentOrgId).eq('function_id', functionId).gt('allowed_count', 0)
    .order('family_no');

  const familyNos = (passes || []).map(p => p.family_no);
  const { data: heads } = familyNos.length
    ? await db.from('dr_family_individuals').select('family_no, person_name').eq('org_id', currentOrgId).in('family_no', familyNos).eq('is_head', true)
    : { data: [] };
  const nameMap = {};
  (heads || []).forEach(h => { nameMap[h.family_no] = h.person_name; });

  lastFunctionReportRows = (passes || []).map(p => ({
    familyNo: p.family_no, name: nameMap[p.family_no] || '-', persons: p.allowed_count,
    amount: parseFloat(p.total_amount) || 0, mode: p.payment_mode || 'cash', receiptNo: p.receipt_no || ''
  }));
  lastFunctionReportName = fn.name;

  const totalPersons = lastFunctionReportRows.reduce((s, r) => s + r.persons, 0);
  const totalAmount = lastFunctionReportRows.reduce((s, r) => s + r.amount, 0);

  const rowsHtml = lastFunctionReportRows.length
    ? lastFunctionReportRows.map(r => `
        <tr>
          <td>${r.familyNo}</td><td>${r.name}</td><td style="text-align:center;">${r.persons}</td>
          <td style="text-align:right;">${fn.is_free ? '-' : formatAmount(r.amount)}</td>
          <td>${fn.is_free ? '-' : (r.mode === 'online' ? '📱' : '💵')}</td>
          <td>${r.receiptNo ? '#' + r.receiptNo : '-'}</td>
        </tr>`).join('')
    : `<tr><td colspan="6" style="text-align:center;color:var(--text-muted);">No passes recorded yet.</td></tr>`;

  showModal(`
    <div class="modal-header"><h3>📊 ${fn.name} — Report</h3></div>
    <div style="font-size:12px;color:var(--text-muted);margin-bottom:10px;">${new Date(fn.event_date + 'T00:00:00').toLocaleDateString('en-IN', { day:'numeric', month:'short', year:'numeric' })} · ${fn.is_free ? 'Free event' : '₹' + fn.amount_per_person + '/person'}</div>
    <div style="display:flex;gap:16px;margin-bottom:10px;">
      <div><strong style="font-size:18px;">${lastFunctionReportRows.length}</strong> <span style="font-size:11px;color:var(--text-muted);">families</span></div>
      <div><strong style="font-size:18px;">${totalPersons}</strong> <span style="font-size:11px;color:var(--text-muted);">persons</span></div>
      ${!fn.is_free ? `<div><strong style="font-size:18px;color:#2E7D32;">${formatAmount(totalAmount)}</strong> <span style="font-size:11px;color:var(--text-muted);">collected</span></div>` : ''}
    </div>
    <div style="max-height:300px;overflow-y:auto;">
      <table class="data-table">
        <thead><tr><th>Family</th><th>Name</th><th>Persons</th><th>Amount</th><th>Mode</th><th>Receipt</th></tr></thead>
        <tbody>${rowsHtml}</tbody>
      </table>
    </div>
    <div class="modal-actions">
      <button class="btn-sm btn-secondary" onclick="downloadFunctionReportExcel()">⬇️ Excel</button>
      <button class="btn-secondary" onclick="closeModal()">Close</button>
    </div>
  `);
}

function downloadFunctionReportExcel() {
  if (typeof XLSX === 'undefined') { showToast('Excel library not loaded', 'error'); return; }
  const rows = [['Family No.', 'Name', 'Persons', 'Amount', 'Payment Mode', 'Receipt No.']];
  lastFunctionReportRows.forEach(r => rows.push([r.familyNo, r.name, r.persons, r.amount, r.mode, r.receiptNo]));
  rows.push(['', '', '', '', '', '']);
  rows.push(['', 'TOTAL', lastFunctionReportRows.reduce((s, r) => s + r.persons, 0), lastFunctionReportRows.reduce((s, r) => s + r.amount, 0), '', '']);
  const ws = XLSX.utils.aoa_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Report');
  XLSX.writeFile(wb, `${lastFunctionReportName.replace(/[^a-z0-9]/gi, '_')}_Report_${todayISO()}.xlsx`);
}

// ---------- Members list entry point ----------
async function showFamilyPassModal(familyNo, headName) {
  const { data: famMembers } = await db.from('dr_members').select('id').eq('org_id', currentOrgId).eq('family_no', familyNo);
  showModal(`
    <div class="modal-header"><h3>🎟 ${headName} — Event Passes</h3></div>
    <div id="family-pass-list">Loading...</div>
  `);
  const html = await buildFamilyPassesHTML(familyNo, (famMembers || []).length);
  const el = document.getElementById('family-pass-list');
  if (el) el.innerHTML = html;
}
