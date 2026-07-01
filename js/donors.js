// ==========================================
// DERASAR BOLI - Donors Tab
// ==========================================

let allDonorReceipts = [];

async function renderDonors() {
  const content = document.getElementById('page-content');
  content.innerHTML = `
    <div class="card">
      <div class="section-header">
        <h3>🤝 Donors</h3>
      </div>
      <div class="search-box" style="margin-bottom:14px;">
        <input type="text" id="donor-search" placeholder="Search by name or family no..." oninput="filterDonors()" />
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
  const { data: receipts, error } = await db
    .from('dr_receipts')
    .select('*')
    .eq('org_id', currentOrgId)
    .order('created_at', { ascending: false });

  if (error || !receipts) {
    document.getElementById('donors-list').innerHTML =
      `<div class="empty-state"><div class="empty-icon">🤝</div><p>Could not load donors.</p></div>`;
    return;
  }

  allDonorReceipts = receipts;
  renderDonorList(receipts);
}

function groupByDonor(receipts) {
  const map = {};
  receipts.forEach(r => {
    const key = r.member_id || (r.receipt_name + '|' + (r.family_no || ''));
    if (!map[key]) {
      map[key] = {
        key,
        name:      r.receipt_name,
        family:    r.family_no || '—',
        memberId:  r.member_id || null,
        paid:      0,
        pending:   0,
        count:     0,
        lastDate:  r.created_at
      };
    }
    const amt = parseFloat(r.total_amount || 0);
    if (r.is_paid) map[key].paid    += amt;
    else           map[key].pending += amt;
    map[key].count++;
    if (r.created_at > map[key].lastDate) map[key].lastDate = r.created_at;
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

function renderDonorList(receipts) {
  const donors = groupByDonor(receipts);
  const statsEl = document.getElementById('donors-stats');
  const listEl  = document.getElementById('donors-list');

  const totalDonors  = donors.length;
  const totalPaid    = donors.reduce((s, d) => s + d.paid, 0);
  const totalPending = donors.reduce((s, d) => s + d.pending, 0);
  const withPending  = donors.filter(d => d.pending > 0).length;

  const chip = (icon, val, label, color) =>
    `<div style="display:flex;align-items:center;gap:6px;padding:8px 14px;border-radius:20px;font-size:13px;font-weight:600;
      background:#FFF8F0;border:1.5px solid ${color || 'var(--accent)'};color:${color || 'var(--primary)'};">
      ${icon} <span>${val}</span><span style="font-weight:400;">${label}</span>
    </div>`;

  statsEl.innerHTML =
    chip('🤝', totalDonors, ' Donors') +
    chip('✅', formatAmount(totalPaid), ' Collected', '#4CAF50') +
    (totalPending > 0 ? chip('⏳', formatAmount(totalPending), ` Pending (${withPending})`, '#ff9800') : '');

  if (donors.length === 0) {
    listEl.innerHTML = `<div class="empty-state"><div class="empty-icon">🤝</div><p>No donors yet.</p></div>`;
    return;
  }

  listEl.innerHTML = `
    <div style="overflow-x:auto;">
    <table class="data-table">
      <thead>
        <tr>
          <th>#</th><th>Name</th><th>Family No.</th>
          <th style="text-align:right;color:#4CAF50;">✅ Paid</th>
          <th style="text-align:right;color:#ff9800;">⏳ Pending</th>
          <th style="text-align:right;">Total</th>
          <th>History</th>
        </tr>
      </thead>
      <tbody>
        ${donors.map((d, i) => `
          <tr style="${d.pending > 0 ? 'background:#fffbf0;' : ''}">
            <td>${i + 1}</td>
            <td><strong>${d.name}</strong></td>
            <td>${d.family}</td>
            <td style="text-align:right;color:#4CAF50;font-weight:600;">${formatAmount(d.paid)}</td>
            <td style="text-align:right;color:${d.pending > 0 ? '#ff9800' : 'var(--text-muted)'};font-weight:600;">${formatAmount(d.pending)}</td>
            <td style="text-align:right;font-weight:700;color:var(--primary);">${formatAmount(d.paid + d.pending)}</td>
            <td>
              <button class="btn-sm btn-secondary" onclick="showDonorHistory_tab('${d.key.replace(/'/g, "\\'")}','${d.name.replace(/'/g, "\\'")}','${d.family}')">📜</button>
            </td>
          </tr>
        `).join('')}
      </tbody>
      <tfoot>
        <tr style="background:var(--primary);color:white;font-weight:700;">
          <td colspan="3">${donors.length} donors</td>
          <td style="text-align:right;">${formatAmount(totalPaid)}</td>
          <td style="text-align:right;">${formatAmount(totalPending)}</td>
          <td style="text-align:right;">${formatAmount(totalPaid + totalPending)}</td>
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
      ? allDonorReceipts.filter(r =>
          (r.receipt_name || '').toLowerCase().includes(q) ||
          (r.family_no   || '').toLowerCase().includes(q))
      : allDonorReceipts;
    renderDonorList(filtered);
  }, 250);
}

async function showDonorHistory_tab(donorKey, donorName, familyNo) {
  showModal(`<div class="modal-title">📜 ${donorName}</div><p style="color:var(--text-muted);font-size:13px;">Loading...</p>`);

  const receipts = allDonorReceipts.filter(r => {
    const key = r.member_id || (r.receipt_name + '|' + (r.family_no || ''));
    return key === donorKey;
  }).sort((a, b) => b.created_at.localeCompare(a.created_at));

  let memberPhone = '';
  const memberId = receipts[0]?.member_id;
  if (memberId) {
    const { data: m } = await db.from('dr_members').select('phone_no').eq('id', memberId).single();
    memberPhone = (m?.phone_no || '').replace(/\D/g, '');
  }

  const grandTotal   = receipts.reduce((s, r) => s + parseFloat(r.total_amount || 0), 0);
  const paidTotal    = receipts.filter(r => r.is_paid).reduce((s, r) => s + parseFloat(r.total_amount || 0), 0);
  const pendingTotal = grandTotal - paidTotal;

  document.getElementById('modal-box').innerHTML = `
    <div class="modal-title">📜 ${donorName}</div>
    <div style="font-size:12px;color:var(--text-muted);margin-bottom:10px;">
      Family No: ${familyNo}
      ${memberPhone ? `&nbsp;·&nbsp; 📞 ${memberPhone}` : ''}
      &nbsp;·&nbsp; ${receipts.length} receipt(s)
    </div>
    <div style="display:flex;gap:8px;margin-bottom:14px;">
      <div style="flex:1;background:var(--primary);color:white;border-radius:8px;padding:10px;text-align:center;">
        <div style="font-size:10px;opacity:.8;">Total</div>
        <div style="font-size:20px;font-weight:800;">${formatAmount(grandTotal)}</div>
      </div>
      <div style="flex:1;background:#4CAF50;color:white;border-radius:8px;padding:10px;text-align:center;">
        <div style="font-size:10px;opacity:.8;">✅ Paid</div>
        <div style="font-size:20px;font-weight:800;">${formatAmount(paidTotal)}</div>
      </div>
      ${pendingTotal > 0 ? `
      <div style="flex:1;background:#ff9800;color:white;border-radius:8px;padding:10px;text-align:center;">
        <div style="font-size:10px;opacity:.8;">⏳ Pending</div>
        <div style="font-size:20px;font-weight:800;">${formatAmount(pendingTotal)}</div>
      </div>` : ''}
    </div>
    <div style="max-height:380px;overflow-y:auto;">
      ${receipts.map(r => {
        const dt = new Date(r.created_at).toLocaleDateString('en-IN', {day:'2-digit',month:'2-digit',year:'numeric'});
        return `
        <div style="border:1.5px solid var(--border);border-radius:8px;padding:10px 12px;margin-bottom:8px;">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
            <div>
              <strong style="color:var(--primary);font-size:14px;">ન. ${r.receipt_no}</strong>
              <span style="font-size:11px;color:var(--text-muted);margin-left:8px;">${dt}</span>
            </div>
            <span style="font-size:11px;padding:2px 8px;border-radius:10px;font-weight:700;
              background:${r.is_paid ? '#e8f5e9' : '#fff3e0'};
              color:${r.is_paid ? '#2e7d32' : '#e65100'};">
              ${r.is_paid ? '✅ Paid' : '⏳ Pending'}
            </span>
          </div>
          <div style="display:flex;justify-content:space-between;align-items:center;">
            <div style="font-size:13px;">
              <strong>${formatAmount(parseFloat(r.total_amount))}</strong>
              <span style="font-size:11px;color:var(--text-muted);margin-left:6px;">${r.payment_mode || ''}</span>
            </div>
            <div style="display:flex;gap:6px;">
              <button class="btn-sm btn-secondary" onclick="showReceiptById('${r.id}',false,'${memberPhone}')">🧾 View</button>
              <button class="btn-sm" style="background:#25D366;color:white;border:none;border-radius:6px;padding:5px 10px;font-size:12px;cursor:pointer;"
                onclick="showReceiptById('${r.id}',true,'${memberPhone}')">📲 Send</button>
            </div>
          </div>
        </div>`;
      }).join('')}
    </div>
    <div class="modal-actions" style="margin-top:10px;">
      <button class="btn-secondary" onclick="closeModal()">Close</button>
    </div>
  `;
}
