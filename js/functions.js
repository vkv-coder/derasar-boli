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
    el.innerHTML = `<p style="font-size:12px;color:var(--text-muted);">No upcoming functions. Add one below.</p>`;
    return;
  }

  const totals = await Promise.all(functions.map(f =>
    db.from('dr_function_passes').select('allowed_count').eq('org_id', currentOrgId).eq('function_id', f.id)
      .then(({ data }) => (data || []).reduce((s, r) => s + (r.allowed_count || 0), 0))
  ));

  el.innerHTML = functions.map((f, i) => `
    <div style="display:flex;justify-content:space-between;align-items:center;border:1.5px solid var(--border);border-radius:8px;padding:8px 12px;margin-bottom:6px;">
      <div>
        <strong>${f.name}</strong>
        <div style="font-size:11px;color:var(--text-muted);">${new Date(f.event_date + 'T00:00:00').toLocaleDateString('en-IN', { day:'numeric', month:'short', year:'numeric' })}</div>
      </div>
      <div style="display:flex;align-items:center;gap:10px;">
        <div style="text-align:center;">
          <div style="font-size:18px;font-weight:800;color:var(--primary);">${totals[i]}</div>
          <div style="font-size:9px;color:var(--text-muted);">TOTAL ALLOTTED</div>
        </div>
        <button class="btn-sm btn-danger" onclick="deleteFunction('${f.id}')">Del</button>
      </div>
    </div>
  `).join('');
}

function showAddFunctionModal() {
  showModal(`
    <div class="modal-header"><h3>🎟 Add Function</h3></div>
    <div class="form-group">
      <label>Function Name</label>
      <input type="text" id="fn-name-input" placeholder="e.g. Diwali Snehmilan" />
    </div>
    <div class="form-group">
      <label>Event Date</label>
      <input type="date" id="fn-date-input" value="${todayISO()}" />
    </div>
    <button class="btn-primary" onclick="saveNewFunction()">Save</button>
  `);
}

async function saveNewFunction() {
  const name = document.getElementById('fn-name-input').value.trim();
  const eventDate = document.getElementById('fn-date-input').value;
  if (!name || !eventDate) { showToast('Enter name and date', 'error'); return; }
  const { error } = await db.from('dr_functions').insert({ org_id: currentOrgId, name, event_date: eventDate });
  if (error) { showToast('Error: ' + error.message, 'error'); return; }
  showToast('✅ Function added!', 'success');
  closeModal();
  await loadFunctionsList();
}

async function deleteFunction(id) {
  if (!confirm('Delete this function? Any saved pass counts for it will also be removed.')) return;
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
    return `<p style="font-size:12px;color:var(--text-muted);">No upcoming functions.</p>`;
  }

  const passMap = {};
  (passes || []).forEach(p => { passMap[p.function_id] = p.allowed_count; });

  return functions.map(f => `
    <div style="display:flex;justify-content:space-between;align-items:center;border:1.5px solid var(--border);border-radius:8px;padding:8px 12px;margin-bottom:6px;">
      <div>
        <strong style="font-size:13px;">${f.name}</strong>
        <div style="font-size:11px;color:var(--text-muted);">${new Date(f.event_date + 'T00:00:00').toLocaleDateString('en-IN', { day:'numeric', month:'short', year:'numeric' })} · Family has ${memberCount} member${memberCount === 1 ? '' : 's'}</div>
      </div>
      <input type="number" min="0" max="${memberCount}" value="${passMap[f.id] ?? ''}" placeholder="0"
        style="width:64px;padding:5px 6px;border:1.5px solid var(--border);border-radius:6px;font-size:14px;font-weight:700;text-align:center;"
        onchange="saveFamilyPass('${f.id}', '${familyNo.replace(/'/g, "\\'")}', this.value)" />
    </div>
  `).join('');
}

async function saveFamilyPass(functionId, familyNo, value) {
  const count = value === '' ? 0 : Math.max(0, parseInt(value, 10) || 0);
  const { error } = await db.from('dr_function_passes')
    .upsert({ org_id: currentOrgId, function_id: functionId, family_no: familyNo, allowed_count: count, updated_at: new Date().toISOString() },
      { onConflict: 'function_id,family_no' });
  if (error) { showToast('Error: ' + error.message, 'error'); return; }
  showToast('✅ Passes saved: ' + count, 'success');
}

// ---------- Members list entry point ----------
async function showFamilyPassModal(familyNo, headName) {
  const { data: famMembers } = await db.from('dr_members').select('id').eq('org_id', currentOrgId).eq('family_no', familyNo);
  showModal(`
    <div class="modal-header"><h3>🎟 ${headName} — Function Passes</h3></div>
    <div id="family-pass-list">Loading...</div>
  `);
  const html = await buildFamilyPassesHTML(familyNo, (famMembers || []).length);
  const el = document.getElementById('family-pass-list');
  if (el) el.innerHTML = html;
}
