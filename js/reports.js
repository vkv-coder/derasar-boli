// ==========================================
// DERASAR BOLI - Reports
// ==========================================

async function renderReports() {
  const content = document.getElementById('page-content');

  const { data: events } = await supabase
    .from('events')
    .select('*')
    .order('created_at', { ascending: false });

  content.innerHTML = `
    <div class="card">
      <div class="card-title">📊 Reports</div>
      <div class="form-group">
        <label>Select Event</label>
        <select id="report-event-select" onchange="loadReport()">
          <option value="">-- Select Event --</option>
          ${(events || []).map(ev => `<option value="${ev.id}">${ev.name}</option>`).join('')}
        </select>
      </div>
    </div>
    <div id="report-content"></div>
  `;
}

async function loadReport() {
  const eventId = document.getElementById('report-event-select').value;
  if (!eventId) return;

  const el = document.getElementById('report-content');
  el.innerHTML = '<p style="color:var(--text-muted);padding:16px;">Loading...</p>';

  const [
    { data: donations },
    { data: swapnas },
    { data: generalHeads },
    { data: eventData }
  ] = await Promise.all([
    supabase.from('donations').select('*').eq('event_id', eventId).order('created_at'),
    supabase.from('swapna').select('*, swapna_items(*)').eq('event_id', eventId).order('display_order'),
    supabase.from('general_heads').select('*').eq('event_id', eventId).order('display_order'),
    supabase.from('events').select('*').eq('id', eventId).single()
  ]);

  if (!donations || donations.length === 0) {
    el.innerHTML = `<div class="card"><div class="empty-state"><div class="empty-icon">📊</div><p>No donations recorded for this event.</p></div></div>`;
    return;
  }

  // Build totals
  const swapnaTotals = {};
  const generalTotals = {};
  let grandTotal = 0;

  donations.forEach(d => {
    grandTotal += parseFloat(d.amount);
    if (d.head_type === 'swapna_item' && d.swapna_item_id) {
      if (!swapnaTotals[d.swapna_item_id]) swapnaTotals[d.swapna_item_id] = { total: 0, donors: [] };
      swapnaTotals[d.swapna_item_id].total += parseFloat(d.amount);
      swapnaTotals[d.swapna_item_id].donors.push(d);
    }
    if (d.head_type === 'general_head' && d.general_head_id) {
      if (!generalTotals[d.general_head_id]) generalTotals[d.general_head_id] = { total: 0, donors: [] };
      generalTotals[d.general_head_id].total += parseFloat(d.amount);
      generalTotals[d.general_head_id].donors.push(d);
    }
  });

  el.innerHTML = `
    <!-- Summary -->
    <div class="card" style="background:var(--primary);color:white;">
      <div style="display:flex;justify-content:space-between;align-items:center;">
        <div>
          <div style="font-size:13px;opacity:0.8;">${eventData.name}</div>
          <div style="font-size:32px;font-weight:800;margin-top:4px;">${formatAmount(grandTotal)}</div>
          <div style="font-size:12px;opacity:0.7;margin-top:2px;">${donations.length} total donations</div>
        </div>
        <button class="btn-accent" onclick="printReport('${eventId}')">🖨 Print</button>
      </div>
    </div>

    <!-- Swapna Report -->
    ${swapnas && swapnas.length > 0 ? `
    <div class="card">
      <div class="card-title">🔶 Swapna Summary</div>
      ${swapnas.map(sw => {
        const items = sw.swapna_items || [];
        const swTotal = items.reduce((sum, item) => sum + (swapnaTotals[item.id]?.total || 0), 0);
        return `
          <div style="margin-bottom:16px;">
            <div style="display:flex;justify-content:space-between;font-weight:700;color:var(--primary);padding:8px 0;border-bottom:2px solid var(--border);">
              <span>${sw.name}</span>
              <span>${formatAmount(swTotal)}</span>
            </div>
            ${items.map(item => {
              const t = swapnaTotals[item.id];
              if (!t) return `<div style="padding:6px 0 6px 12px;font-size:13px;display:flex;justify-content:space-between;border-bottom:1px solid var(--border);"><span>${item.name}</span><span style="color:var(--text-muted);">₹0</span></div>`;
              return `
                <div style="padding:6px 0 6px 12px;border-bottom:1px solid var(--border);">
                  <div style="display:flex;justify-content:space-between;font-size:13px;">
                    <span>${item.name}</span>
                    <strong>${formatAmount(t.total)}</strong>
                  </div>
                  ${t.donors.map(d => `
                    <div style="font-size:11px;color:var(--text-muted);padding-left:8px;margin-top:2px;">
                      • ${d.donor_name} (Family: ${d.family_no || '—'}) — ${formatAmount(d.amount)}
                    </div>
                  `).join('')}
                </div>
              `;
            }).join('')}
          </div>
        `;
      }).join('')}
    </div>
    ` : ''}

    <!-- General Heads Report -->
    ${generalHeads && generalHeads.length > 0 ? `
    <div class="card">
      <div class="card-title">🔷 General Heads Summary</div>
      ${generalHeads.map(h => {
        const t = generalTotals[h.id];
        if (!t) return `<div style="display:flex;justify-content:space-between;padding:10px 0;border-bottom:1px solid var(--border);font-size:13px;"><span>${h.name}</span><span style="color:var(--text-muted);">₹0</span></div>`;
        return `
          <div style="padding:10px 0;border-bottom:1px solid var(--border);">
            <div style="display:flex;justify-content:space-between;font-size:14px;">
              <strong>${h.name}</strong>
              <strong style="color:var(--primary);">${formatAmount(t.total)}</strong>
            </div>
            ${t.donors.map(d => `
              <div style="font-size:11px;color:var(--text-muted);padding-left:8px;margin-top:2px;">
                • ${d.donor_name} (Family: ${d.family_no || '—'}) — ${formatAmount(d.amount)} ${d.note ? '| ' + d.note : ''}
              </div>
            `).join('')}
          </div>
        `;
      }).join('')}
    </div>
    ` : ''}

    <!-- All Donations Table -->
    <div class="card">
      <div class="card-title">All Donations</div>
      <div style="overflow-x:auto;">
        <table class="data-table">
          <thead>
            <tr><th>#</th><th>Donor</th><th>Family No.</th><th>Head</th><th>Amount</th><th>Note</th><th>Time</th></tr>
          </thead>
          <tbody>
            ${donations.map((d, i) => `
              <tr>
                <td>${i + 1}</td>
                <td>${d.donor_name}</td>
                <td>${d.family_no || '—'}</td>
                <td><span class="badge ${d.head_type === 'swapna_item' ? 'badge-swapna' : 'badge-general'}">${d.head_type === 'swapna_item' ? 'Swapna' : 'General'}</span></td>
                <td><strong>${formatAmount(d.amount)}</strong></td>
                <td style="font-size:12px;">${d.note || '—'}</td>
                <td style="font-size:11px;color:var(--text-muted);">${new Date(d.created_at).toLocaleString('en-IN')}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

function printReport(eventId) {
  window.print();
}
