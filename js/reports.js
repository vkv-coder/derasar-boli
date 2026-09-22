// ==========================================
// DERASAR BOLI - Live View
// ==========================================

let liveSubscription = null;

async function renderLive() {
  const content = document.getElementById('page-content');

  if (!isAdmin()) {
    content.innerHTML = `
      <div class="card" style="text-align:center;padding:40px;">
        <div style="font-size:48px;margin-bottom:12px;">🔒</div>
        <p style="color:var(--danger);font-weight:600;">Admin access only.</p>
      </div>`;
    return;
  }

  content.innerHTML = `
    <div class="card">
      <div class="section-header">
        <h3><span class="live-dot"></span> Live View</h3>
      </div>
    </div>
    <div id="live-content"></div>
  `;

  // No event picker anymore — every head is reachable via Donation Entry's
  // Day 1/3/5/7/8 tabs now, so Live View just shows everything for the org
  // unconditionally instead of requiring an event to be selected first.
  await loadLiveData();

  // Subscribe to real-time changes, org-wide.
  if (liveSubscription) {
    db.removeChannel(liveSubscription);
    liveSubscription = null;
  }
  liveSubscription = db
    .channel('live-donations-' + currentOrgId)
    .on('postgres_changes', {
      event: '*',
      schema: 'public',
      table: 'dr_donations',
      filter: `org_id=eq.${currentOrgId}`
    }, () => {
      loadLiveData();
    })
    .subscribe();
}

async function loadLiveData() {
  const el = document.getElementById('live-content');

  const { data: donations } = await db
    .from('dr_donations')
    .select('*')
    .eq('org_id', currentOrgId)
    .order('created_at', { ascending: false });

  // Load swapna items — org-wide, not tied to any one event. Ordering
  // column is sort_order, not display_order (matching every other file
  // that queries dr_swapna/dr_swapna_items - display_order doesn't exist
  // on this table, which is why auctions were rendering in a seemingly
  // random order before). Embedded dr_swapna_items also need their own
  // sort - PostgREST doesn't order nested resources from a single
  // .order() call, so sort each auction's items client-side same as
  // donations.js already does elsewhere.
  const { data: swapnas } = await db
    .from('dr_swapna')
    .select('*, dr_swapna_items(*)')
    .eq('org_id', currentOrgId)
    .order('sort_order');
  (swapnas || []).forEach(sw => {
    (sw.dr_swapna_items || []).sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
  });

  // General heads have no event_id of their own — fetch by org, not event.
  const { data: generalHeads } = await db
    .from('dr_general_heads')
    .select('*')
    .eq('org_id', currentOrgId)
    .order('display_order');

  if (!donations) return;

  // Calculate totals
  // "total" = amount pledged/entered (dr_donations.amount, recorded at
  // entry time). "received" = received_amount, the separate field used
  // elsewhere to gate receipt printing until payment is actually
  // confirmed - shown alongside so pledged vs. actually-collected is
  // visible at a glance instead of only the pledged figure.
  const swapnaTotals = {};      // per dr_swapna_items.id (a specific item picked)
  const swapnaDirectTotals = {}; // per dr_swapna.id (donated to the auction itself, no item picked)
  const generalTotals = {};
  let grandTotal = 0;
  let grandReceived = 0;
  let swapnaGrandTotal = 0;
  let swapnaGrandReceived = 0;

  donations.forEach(d => {
    const amt = parseFloat(d.amount) || 0;
    const rcvd = parseFloat(d.received_amount) || 0;
    grandTotal += amt;
    grandReceived += rcvd;
    // Donation Entry records a Swapna donation one of two ways: against a
    // specific item (head_type='swapna_item', swapna_item_id set) or
    // directly against the auction with no item picked (head_type='swapna',
    // swapna_id set) - real incident: only the first kind was being
    // counted anywhere on this page, silently dropping what turned out to
    // be the larger chunk of real Swapna donations.
    if (d.head_type === 'swapna_item' || d.head_type === 'swapna') {
      // Consolidated Swapna block below sums by head_type alone, and Misc
      // is grandTotal minus this - a subtraction, not a second independent
      // sum - so the two blocks are mathematically guaranteed to add up to
      // the top total exactly, even if a row were missing its item/swapna
      // id link entirely.
      swapnaGrandTotal += amt;
      swapnaGrandReceived += rcvd;
      if (d.head_type === 'swapna_item' && d.swapna_item_id) {
        if (!swapnaTotals[d.swapna_item_id]) swapnaTotals[d.swapna_item_id] = { total: 0, received: 0, count: 0 };
        swapnaTotals[d.swapna_item_id].total += amt;
        swapnaTotals[d.swapna_item_id].received += rcvd;
        swapnaTotals[d.swapna_item_id].count++;
      } else if (d.head_type === 'swapna' && d.swapna_id) {
        if (!swapnaDirectTotals[d.swapna_id]) swapnaDirectTotals[d.swapna_id] = { total: 0, received: 0, count: 0 };
        swapnaDirectTotals[d.swapna_id].total += amt;
        swapnaDirectTotals[d.swapna_id].received += rcvd;
        swapnaDirectTotals[d.swapna_id].count++;
      }
    }
    if (d.head_type === 'general_head' && d.general_head_id) {
      if (!generalTotals[d.general_head_id]) generalTotals[d.general_head_id] = { total: 0, received: 0, count: 0 };
      generalTotals[d.general_head_id].total += amt;
      generalTotals[d.general_head_id].received += rcvd;
      generalTotals[d.general_head_id].count++;
    }
  });

  const miscGrandTotal = grandTotal - swapnaGrandTotal;
  const miscGrandReceived = grandReceived - swapnaGrandReceived;

  // Flat, sequential (auction order, then item order within it) list for
  // the block grid below - e.g. 14 auctions x 3 items = 42 blocks.
  const swapnaItemBlocks = [];
  (swapnas || []).forEach(sw => {
    (sw.dr_swapna_items || []).forEach(item => {
      const t = swapnaTotals[item.id] || { total: 0, received: 0, count: 0 };
      swapnaItemBlocks.push({ auctionName: sw.name, itemName: item.name, total: t.total, received: t.received, count: t.count });
    });
  });

  el.innerHTML = `
    <!-- Grand Total -->
    <div class="card" style="background:var(--primary);color:white;text-align:center;">
      <div style="display:flex;justify-content:center;gap:28px;flex-wrap:wrap;">
        <div>
          <div style="font-size:13px;opacity:0.8;margin-bottom:4px;">Pledged</div>
          <div style="font-size:36px;font-weight:800;">${formatAmount(grandTotal)}</div>
        </div>
        <div>
          <div style="font-size:13px;opacity:0.8;margin-bottom:4px;">Received</div>
          <div style="font-size:36px;font-weight:800;color:#A5D6A7;">${formatAmount(grandReceived)}</div>
        </div>
      </div>
      <div style="font-size:12px;opacity:0.7;margin-top:4px;">${donations.length} entries</div>
    </div>

    <!-- Swapna Totals - flat, sequential list of every item across every
         auction (auction 1's items, then auction 2's, then auction 3's...
         in sort_order), one block each - no auction grouping/headers/
         totals here, those are covered by the Swapna consolidated card in
         the matrix below instead. "Direct" (donated to the auction with no
         item picked) still counts toward that consolidated total but isn't
         shown as its own block here, since it's not one of the named items. -->
    ${swapnaItemBlocks.length > 0 ? `
    <div class="card">
      <div class="card-title">🔶 Swapna Items (${swapnaItemBlocks.length})</div>
      <div class="total-grid">
        ${swapnaItemBlocks.map(b => `
          <div class="total-card">
            <div style="font-size:10px;color:var(--text-muted);">${b.auctionName}</div>
            <div class="head-name">${b.itemName}</div>
            <div class="total-amount">${formatAmount(b.total)}</div>
            <div class="entry-count">${b.count} entr${b.count === 1 ? 'y' : 'ies'}</div>
          </div>
        `).join('')}
      </div>
    </div>
    ` : ''}

    <!-- General Head Totals - the Swapna and Misc consolidated totals sit
         as the first two cards in this SAME grid (not a separate section),
         so it reads as one continuous block: Grand Total above = Swapna +
         Misc + every individual head/sub-head card that follows them. -->
    <div class="card">
      <div class="card-title">🔷 General Heads</div>
      <div class="total-grid">
        <div class="total-card" style="border-left:4px solid var(--accent);">
          <div class="head-name">🔶 Swapna (All Items + Direct)</div>
          <div class="total-amount">${formatAmount(swapnaGrandTotal)}</div>
          <div style="font-size:11px;color:#2E7D32;font-weight:600;">Received: ${formatAmount(swapnaGrandReceived)}</div>
        </div>
        <div class="total-card" style="border-left:4px solid var(--primary);">
          <div class="head-name">🔷 Misc Subtotal (all heads below)</div>
          <div class="total-amount">${formatAmount(miscGrandTotal)}</div>
          <div style="font-size:11px;color:#2E7D32;font-weight:600;">Received: ${formatAmount(miscGrandReceived)}</div>
        </div>
        ${(generalHeads || []).map(h => {
          const t = generalTotals[h.id] || { total: 0, received: 0, count: 0 };
          return `
            <div class="total-card">
              <div class="head-name">${h.name}</div>
              <div class="total-amount">${formatAmount(t.total)}</div>
              <div style="font-size:11px;color:#2E7D32;font-weight:600;">Received: ${formatAmount(t.received)}</div>
              <div class="entry-count">${t.count} entr${t.count === 1 ? 'y' : 'ies'}</div>
            </div>
          `;
        }).join('')}
      </div>
    </div>

    <!-- Recent Donations -->
    <div class="card">
      <div class="card-title">Recent Donations</div>
      ${donations.length === 0
        ? '<div class="empty-state"><div class="empty-icon">💰</div><p>No donations yet.</p></div>'
        : `<table class="data-table">
            <thead><tr><th>Donor</th><th>Family</th><th>Head</th><th>Amount</th><th>Time</th></tr></thead>
            <tbody>
              ${donations.slice(0, 20).map(d => `
                <tr>
                  <td>${d.donor_name}</td>
                  <td>${d.family_no || '—'}</td>
                  <td><span class="badge ${(d.head_type === 'swapna_item' || d.head_type === 'swapna') ? 'badge-swapna' : 'badge-general'}">${(d.head_type === 'swapna_item' || d.head_type === 'swapna') ? 'Swapna' : 'General'}</span></td>
                  <td><strong>${formatAmount(d.amount)}</strong></td>
                  <td style="font-size:11px;color:var(--text-muted);">${new Date(d.created_at).toLocaleTimeString('en-IN', {hour:'2-digit',minute:'2-digit'})}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>`
      }
    </div>
  `;
}
