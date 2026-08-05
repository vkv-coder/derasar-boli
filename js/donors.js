// ==========================================
// DERASAR BOLI - Donors Tab
// ==========================================
// Sourced directly from dr_donations (grouped by whoever actually pays —
// a member, or name+phone for a non-member) so every donation entered
// shows up here immediately. Paid/pending reuses the same
// amount vs received_amount tracking as the Reports tab.
//
// Reuses getDonationHeadName()/whatsappReportRow() from reports-page.js
// (plain globals, safe to call cross-file) by populating the same
// reportSwapnaTree/reportSwapnaItems/reportGeneralHeads/reportAllDonations
// variables those functions read — avoids re-implementing head-name
// resolution here.

let allDonorDonations = [];

async function renderDonors() {
  const content = document.getElementById('page-content');
  content.innerHTML = `
    <div class="card">
      <div class="section-header">
        <h3>🤝 Donors</h3>
      </div>
      <div class="search-box" style="margin-bottom:14px;">
        <input type="text" id="donor-search" placeholder="Search by name, family no. or phone..." oninput="filterDonors()" />
      </div>
      <div id="donors-stats" style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:12px;">
        <div style="color:var(--text-muted);font-size:13px;">Loading...</div>
      </div>
      <div id="donors-list">Loading...</div>
    </div>
  `;
  await loadDonorsList();
}

async function loadDonorsList() {
  const [{ data: donations, error }, { data: swapnaTree }, { data: swapnaItems }, { data: generalHeads }] = await Promise.all([
    db.from('dr_donations').select('*').eq('org_id', currentOrgId).order('created_at', { ascending: false }),
    db.from('dr_swapna').select('*').eq('org_id', currentOrgId),
    db.from('dr_swapna_items').select('*').eq('org_id', currentOrgId),
    db.from('dr_general_heads').select('*').eq('org_id', currentOrgId).order('display_order')
  ]);

  if (error || !donations) {
    document.getElementById('donors-list').innerHTML =
      `<div class="empty-state"><div class="empty-icon">🤝</div><p>Could not load donors.</p></div>`;
    return;
  }

  // Member-type donations don't carry phone on dr_donations itself — pull it from dr_members.
  const memberIds = [...new Set(donations.filter(d => d.member_id).map(d => d.member_id))];
  if (memberIds.length > 0) {
    const { data: members } = await db.from('dr_members').select('id, phone_no').in('id', memberIds);
    const phoneById = {};
    (members || []).forEach(m => { phoneById[m.id] = m.phone_no; });
    donations.forEach(d => { if (d.member_id && !d.phone) d.phone = phoneById[d.member_id] || null; });
  }

  reportSwapnaTree = swapnaTree || [];
  reportSwapnaItems = swapnaItems || [];
  reportGeneralHeads = generalHeads || [];
  reportAllDonations = donations;

  allDonorDonations = donations;
  renderDonorList(donations);
}

function groupByDonor(donations) {
  const map = {};
  donations.forEach(d => {
    const key = d.member_id || (d.donor_name + '|' + (d.phone || ''));
    if (!map[key]) {
      map[key] = {
        key,
        name: d.donor_name,
        family: d.family_no || '—',
        phone: d.phone || '—',
        memberId: d.member_id || null,
        entered: 0,
        received: 0,
        count: 0,
        lastDate: d.created_at
      };
    }
    map[key].entered += parseFloat(d.amount || 0);
    map[key].received += parseFloat(d.received_amount || 0);
    map[key].count++;
    if (d.created_at > map[key].lastDate) map[key].lastDate = d.created_at;
  });

  return Object.values(map).sort((a, b) => {
    const fa = a.family === '—' ? 'ZZZ' : a.family;
    const fb = b.family === '—' ? 'ZZZ' : b.family;
    const parseF = s => { const m = s.match(/^([A-Za-z]+)-?(\d+)$/); return m ? [m[1].toUpperCase(), parseInt(m[2])] : [s, 0]; };
    const [aL, aN] = parseF(fa);
    const [bL, bN] = parseF(fb);
    return aL < bL ? -1 : aL > bL ? 1 : aN - bN;
  });
}

function renderDonorList(donations) {
  const donors = groupByDonor(donations);
  const statsEl = document.getElementById('donors-stats');
  const listEl  = document.getElementById('donors-list');

  const totalDonors   = donors.length;
  const totalReceived = donors.reduce((s, d) => s + d.received, 0);
  const totalPending  = donors.reduce((s, d) => s + Math.max(d.entered - d.received, 0), 0);
  const withPending   = donors.filter(d => (d.entered - d.received) > 0).length;

  const chip = (icon, val, label, color) =>
    `<div style="display:flex;align-items:center;gap:6px;padding:8px 14px;border-radius:20px;font-size:13px;font-weight:600;
      background:#FFF8F0;border:1.5px solid ${color || 'var(--accent)'};color:${color || 'var(--primary)'};">
      ${icon} <span>${val}</span><span style="font-weight:400;">${label}</span>
    </div>`;

  statsEl.innerHTML =
    chip('🤝', totalDonors, ' Donors') +
    chip('✅', formatAmount(totalReceived), ' Collected', '#4CAF50') +
    (totalPending > 0 ? chip('⏳', formatAmount(totalPending), ` To Collect (${withPending})`, '#ff9800') : '');

  if (donors.length === 0) {
    listEl.innerHTML = `<div class="empty-state"><div class="empty-icon">🤝</div><p>No donors yet.</p></div>`;
    return;
  }

  listEl.innerHTML = `
    <div style="overflow-x:auto;">
    <table class="data-table">
      <thead>
        <tr>
          <th>#</th><th>Name</th><th>Family No.</th><th>Phone</th>
          <th style="text-align:right;color:#4CAF50;">✅ Received</th>
          <th style="text-align:right;color:#ff9800;">⏳ To Collect</th>
          <th style="text-align:right;">Total Pledged</th>
          <th>History</th>
        </tr>
      </thead>
      <tbody>
        ${donors.map((d, i) => {
          const pending = Math.max(d.entered - d.received, 0);
          return `
          <tr style="${pending > 0 ? 'background:#fffbf0;' : ''}">
            <td>${i + 1}</td>
            <td><strong>${d.name}</strong></td>
            <td>${d.family}</td>
            <td style="font-size:12px;">${d.phone}</td>
            <td style="text-align:right;color:#4CAF50;font-weight:600;">${formatAmount(d.received)}</td>
            <td style="text-align:right;color:${pending > 0 ? '#ff9800' : 'var(--text-muted)'};font-weight:600;">${formatAmount(pending)}</td>
            <td style="text-align:right;font-weight:700;color:var(--primary);">${formatAmount(d.entered)}</td>
            <td>
              <button class="btn-sm btn-secondary" onclick="showDonorHistory_tab('${d.key.replace(/'/g, "\\'")}','${d.name.replace(/'/g, "\\'")}','${d.family}')">📜</button>
            </td>
          </tr>
        `; }).join('')}
      </tbody>
      <tfoot>
        <tr style="background:var(--primary);color:white;font-weight:700;">
          <td colspan="4">${donors.length} donors</td>
          <td style="text-align:right;">${formatAmount(totalReceived)}</td>
          <td style="text-align:right;">${formatAmount(totalPending)}</td>
          <td style="text-align:right;">${formatAmount(totalReceived + totalPending)}</td>
          <td></td>
        </tr>
      </tfoot>
    </table>
    </div>
  `;
}

let donorSearchTimer = null;
function filterDonors() {
  clearTimeout(donorSearchTimer);
  donorSearchTimer = setTimeout(() => {
    const q = (document.getElementById('donor-search')?.value || '').toLowerCase().trim();
    const filtered = q
      ? allDonorDonations.filter(d =>
          (d.donor_name || '').toLowerCase().includes(q) ||
          (d.family_no  || '').toLowerCase().includes(q) ||
          (d.phone      || '').toLowerCase().includes(q))
      : allDonorDonations;
    renderDonorList(filtered);
  }, 250);
}

async function showDonorHistory_tab(donorKey, donorName, familyNo) {
  showModal(`<div class="modal-title">📜 ${donorName}</div><p style="color:var(--text-muted);font-size:13px;">Loading...</p>`);

  const donations = allDonorDonations.filter(d => {
    const key = d.member_id || (d.donor_name + '|' + (d.phone || ''));
    return key === donorKey;
  }).sort((a, b) => b.created_at.localeCompare(a.created_at));

  const phone    = donations[0]?.phone || '';
  const entered  = donations.reduce((s, d) => s + parseFloat(d.amount || 0), 0);
  const received = donations.reduce((s, d) => s + parseFloat(d.received_amount || 0), 0);
  const pending  = Math.max(entered - received, 0);

  document.getElementById('modal-box').innerHTML = `
    <div class="modal-title">📜 ${donorName}</div>
    <div style="font-size:12px;color:var(--text-muted);margin-bottom:10px;">
      Family No: ${familyNo}
      ${phone ? `&nbsp;·&nbsp; 📞 ${phone}` : ''}
      &nbsp;·&nbsp; ${donations.length} donation(s)
    </div>
    <div style="display:flex;gap:8px;margin-bottom:14px;">
      <div style="flex:1;background:var(--primary);color:white;border-radius:8px;padding:10px;text-align:center;">
        <div style="font-size:10px;opacity:.8;">Pledged</div>
        <div style="font-size:20px;font-weight:800;">${formatAmount(entered)}</div>
      </div>
      <div style="flex:1;background:#4CAF50;color:white;border-radius:8px;padding:10px;text-align:center;">
        <div style="font-size:10px;opacity:.8;">✅ Received</div>
        <div style="font-size:20px;font-weight:800;">${formatAmount(received)}</div>
      </div>
      ${pending > 0 ? `
      <div style="flex:1;background:#ff9800;color:white;border-radius:8px;padding:10px;text-align:center;">
        <div style="font-size:10px;opacity:.8;">⏳ To Collect</div>
        <div style="font-size:20px;font-weight:800;">${formatAmount(pending)}</div>
      </div>` : ''}
    </div>
    <div style="max-height:380px;overflow-y:auto;">
      ${donations.map(d => {
        const dt = new Date(d.created_at).toLocaleDateString('en-IN', {day:'2-digit',month:'2-digit',year:'numeric'});
        const headName = getDonationHeadName(d);
        const isReceived = d.received_amount != null && parseFloat(d.received_amount) >= parseFloat(d.amount);
        return `
        <div style="border:1.5px solid var(--border);border-radius:8px;padding:10px 12px;margin-bottom:8px;">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
            <div style="font-size:12px;color:var(--text-muted);max-width:70%;">${headName}</div>
            <span style="font-size:11px;padding:2px 8px;border-radius:10px;font-weight:700;white-space:nowrap;
              background:${isReceived ? '#e8f5e9' : '#fff3e0'};
              color:${isReceived ? '#2e7d32' : '#e65100'};">
              ${isReceived ? '✅ Received' : '⏳ Pending'}
            </span>
          </div>
          <div style="display:flex;justify-content:space-between;align-items:center;">
            <div style="font-size:13px;">
              <strong>${formatAmount(parseFloat(d.amount))}</strong>${d.mun_qty ? ` <span style="font-size:11px;color:var(--text-muted);">(${d.mun_qty} mun)</span>` : ''}
              <span style="font-size:11px;color:var(--text-muted);margin-left:6px;">${dt}</span>
            </div>
            <div style="display:flex;gap:6px;">
              <button class="btn-sm btn-secondary" onclick="showDonationReceipt('${d.id}')">🧾</button>
              ${d.phone ? `<button class="btn-sm" style="background:#25D366;color:white;" onclick="whatsappReportRow('${d.id}')">📲</button>` : ''}
            </div>
          </div>
          ${d.receipt_name && d.receipt_name !== d.donor_name ? `<div style="font-size:11px;color:var(--text-muted);margin-top:4px;">Receipt in name of: ${d.receipt_name}</div>` : ''}
        </div>`;
      }).join('')}
    </div>
    <div class="modal-actions" style="margin-top:10px;">
      <button class="btn-secondary" onclick="closeModal()">Close</button>
    </div>
  `;
}
