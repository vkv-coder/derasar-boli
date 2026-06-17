// ==========================================
// DERASAR BOLI - Live View
// ==========================================

let liveSubscription = null;
let liveEventId = null;

async function renderLive() {
  const content = document.getElementById('page-content');

  const { data: events } = await db
    .from('events')
    .select('*')
    .eq('is_live', true)
    .order('created_at', { ascending: false });

  content.innerHTML = `
    <div class="card">
      <div class="section-header">
        <h3><span class="live-dot"></span> Live View</h3>
      </div>
      <div class="form-group">
        <label>Select Live Event</label>
        <select id="live-event-select" onchange="onLiveEventChange()">
          <option value="">-- Select Event --</option>
          ${(events || []).map(ev => `<option value="${ev.id}">${ev.name}</option>`).join('')}
        </select>
      </div>
    </div>
    <div id="live-content"></div>
  `;

  if (events && events.length === 1) {
    document.getElementById('live-event-select').value = events[0].id;
    onLiveEventChange();
  }
}

async function onLiveEventChange() {
  liveEventId = document.getElementById('live-event-select').value;
  if (!liveEventId) return;

  if (liveSubscription) {
    db.removeChannel(liveSubscription);
    liveSubscription = null;
  }

  await loadLiveData();

  liveSubscription = db
    .channel('live-donations-' + liveEventId)
    .on('postgres_changes', {
      event: '*',
      schema: 'public',
      table: 'donations',
      filter: `event_id=eq.${liveEventId}`
    }, () => { loadLiveData(); })
    .subscribe();
}

async function loadLiveData() {
  const el = document.getElementById('live-content');

  const [
    { data: donations },
    { data: swapnas },
    { data: generalHeads },
    { data: eventData }
  ] = await Promise.all([
    db.from('donations').select('*').eq('event_id', liveEventId).order('created_at', { ascending: false }),
    db.from('swapna').select('*, swapna_items(*)').eq('event_id', liveEventId).order('display_order'),
    db.from('general_heads').select('*').eq('event_id', liveEventId).order('display_order'),
    db.from('events').select('name').eq('id', liveEventId).single()
  ]);

  if (!donations) return;

  const swapnaTotals = {};
  const generalTotals = {};
  let grandTotal = 0;

  donations.forEach(d => {
    grandTotal += parseFloat(d.amount);
    if (d.head_type === 'swapna_item' && d.swapna_item_id) {
      if (!swapnaTotals[d.swapna_item_id]) swapnaTotals[d.swapna_item_id] = { total: 0, count: 0 };
      swapnaTotals[d.swapna_item_id].total += parseFloat(d.amount);
      swapnaTotals[d.swapna_item_id].count++;
    }
    if (d.head_type === 'general_head' && d.general_head_id) {
      if (!generalTotals[d.general_head_id]) generalTotals[d.general_head_id] = { total: 0, count: 0 };
      generalTotals[d.general_head_id].total += parseFloat(d.amount);
      generalTotals[d.general_head_id].count++;
    }
  });

  const adminActions = isAdmin();

  el.innerHTML = `
    <!-- Grand Total -->
    <div class="card" style="background:var(--primary);color:white;text-align:center;">
      <div style="font-size:13px;opacity:0.8;margin-bottom:4px;">Grand Total</div>
      <div style="font-size:36px;font-weight:800;">${formatAmount(grandTotal)}</div>
      <div style="font-size:12px;opacity:0.7;margin-top:4px;">${donations.length} entries</div>
      <button onclick="whatsappLiveTotal('${(eventData?.name || '').replace(/'/g,"\\'")}',${grandTotal},${donations.length})"
        style="margin-top:12px;background:rgba(255,255,255,0.15);border:1px solid rgba(255,255,255,0.4);color:white;padding:7px 18px;border-radius:20px;font-size:13px;cursor:pointer;">
        📲 Share on WhatsApp
      </button>
    </div>

    <!-- Swapna Totals -->
    ${swapnas && swapnas.length > 0 ? `
    <div class="card">
      <div class="card-title">🔶 Swapna (Auction)</div>
      ${swapnas.map(sw => `
        <div style="margin-bottom:14px;">
          <div style="font-weight:700;color:var(--primary);margin-bottom:6px;">${sw.name}</div>
          <div class="total-grid">
            ${(sw.swapna_items || []).map(item => {
              const t = swapnaTotals[item.id] || { total: 0, count: 0 };
              return `
                <div class="total-card">
                  <div class="head-name">${item.name}</div>
                  <div class="total-amount">${formatAmount(t.total)}</div>
                  <div class="entry-count">${t.count} entr${t.count === 1 ? 'y' : 'ies'}</div>
                </div>
              `;
            }).join('')}
          </div>
        </div>
      `).join('')}
    </div>
    ` : ''}

    <!-- General Head Totals -->
    ${generalHeads && generalHeads.length > 0 ? `
    <div class="card">
      <div class="card-title">🔷 General Heads</div>
      <div class="total-grid">
        ${generalHeads.map(h => {
          const t = generalTotals[h.id] || { total: 0, count: 0 };
          return `
            <div class="total-card">
              <div class="head-name">${h.name}</div>
              <div class="total-amount">${formatAmount(t.total)}</div>
              <div class="entry-count">${t.count} entr${t.count === 1 ? 'y' : 'ies'}</div>
            </div>
          `;
        }).join('')}
      </div>
    </div>
    ` : ''}

    <!-- Recent Donations -->
    <div class="card">
      <div class="card-title">Recent Donations</div>
      ${donations.length === 0
        ? '<div class="empty-state"><div class="empty-icon">💰</div><p>No donations yet.</p></div>'
        : `<div style="overflow-x:auto;"><table class="data-table">
            <thead><tr><th>Donor</th><th>Family</th><th>Head</th><th>Amount</th><th>Time</th><th>Actions</th></tr></thead>
            <tbody>
              ${donations.slice(0, 30).map(d => `
                <tr>
                  <td>${d.donor_name}</td>
                  <td>${d.family_no || '—'}</td>
                  <td><span class="badge ${d.head_type === 'swapna_item' ? 'badge-swapna' : 'badge-general'}">${d.head_type === 'swapna_item' ? 'Swapna' : 'General'}</span></td>
                  <td><strong>${formatAmount(d.amount)}</strong></td>
                  <td style="font-size:11px;color:var(--text-muted);">${new Date(d.created_at).toLocaleTimeString('en-IN', {hour:'2-digit',minute:'2-digit'})}</td>
                  <td>
                    <div style="display:flex;gap:4px;">
                      <button class="btn-sm btn-secondary" title="Receipt" onclick="showDonationReceipt('${d.id}')">🧾</button>
                      ${adminActions ? `
                        <button class="btn-sm" style="background:#4CAF50;color:white;" title="Edit" onclick="showEditDonationModal('${d.id}','live')">✏️</button>
                        <button class="btn-sm btn-danger" title="Delete" onclick="deleteDonation('${d.id}','live')">✕</button>
                      ` : ''}
                    </div>
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table></div>`
      }
    </div>
  `;
}

function whatsappLiveTotal(eventName, total, count) {
  const msg = `🛕 *Derasar Boli – Live Update*\n\n` +
    `📅 Event: ${eventName}\n` +
    `💰 Total: ${formatAmount(total)}\n` +
    `📝 Entries: ${count}\n\n` +
    `🙏 Jai Jinendra`;
  window.open('https://wa.me/?text=' + encodeURIComponent(msg), '_blank');
}
