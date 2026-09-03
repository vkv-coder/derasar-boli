// ==========================================
// DERASAR BOLI - Token Desk (Received + Print)
// Rendered as a section inside the Reports page (not its own tab) — the
// cash-counter admin looks up a token (by name, phone, or token number —
// every donation gets a token regardless of amount, so this is the only
// lookup path into "pending"), confirms cash received, and prints
// immediately for the common single-name case, or defers to
// split-allocation for large auction amounts where the donor wants the
// receipt divided across family names.
// ==========================================

// Simple sequential number (dr_receipt_tokens.token_no, assigned by a DB
// trigger on insert) — not derived from the id, so it's short and easy to
// type/search at the payment counter.
function tokenDisplayCode(t) {
  return String(t.token_no ?? '—');
}

function tokenDeskSectionHTML() {
  return `
    <div class="card">
      <div class="card-title">🎫 Tokens — Received &amp; Print</div>
      <div class="form-group">
        <input type="text" id="token-search" placeholder="Search by name, phone, or token no. (e.g. 12)..." oninput="loadTokensList()" />
      </div>
      <div id="tokens-list">Loading...</div>
    </div>
  `;
}

async function loadTokensList() {
  const el = document.getElementById('tokens-list');
  if (!el) return;

  const { data: tokens, error } = await db.from('dr_receipt_tokens')
    .select('*').eq('org_id', currentOrgId)
    .in('status', ['pending', 'paid_awaiting_split'])
    .order('created_at', { ascending: false });

  if (error) { el.innerHTML = `<p style="color:var(--danger);">Error: ${error.message}</p>`; return; }

  // Allocated tokens don't just vanish — they stay on this list until every
  // split receipt has actually been printed (dr_token_splits.receipt_no is
  // only set once showSplitReceipt() runs for that row), not merely allocated.
  const { data: allocatedTokens } = await db.from('dr_receipt_tokens')
    .select('*, dr_token_splits(id, receipt_no)')
    .eq('org_id', currentOrgId)
    .eq('status', 'allocated')
    .order('created_at', { ascending: false });

  const incompletePrint = (allocatedTokens || [])
    .filter(t => (t.dr_token_splits || []).some(s => !s.receipt_no))
    .map(t => ({
      ...t,
      _printStatus: true,
      _printed: (t.dr_token_splits || []).filter(s => s.receipt_no).length,
      _splitTotal: (t.dr_token_splits || []).length
    }));

  const allTokens = [...(tokens || []), ...incompletePrint];

  if (allTokens.length === 0) {
    el.innerHTML = `<p style="color:var(--text-muted);font-size:13px;">No tokens awaiting action.</p>`;
    return;
  }

  const tokenIds = allTokens.map(t => t.id);
  const { data: lines } = await db.from('dr_donations').select('token_id').in('token_id', tokenIds);
  const countByToken = {};
  (lines || []).forEach(l => { countByToken[l.token_id] = (countByToken[l.token_id] || 0) + 1; });

  const q = (document.getElementById('token-search')?.value || '').toLowerCase().trim();
  const filtered = q
    ? allTokens.filter(t =>
        (t.payer_name || '').toLowerCase().includes(q) ||
        (t.phone || '').toLowerCase().includes(q) ||
        tokenDisplayCode(t).toLowerCase().includes(q))
    : allTokens;

  if (filtered.length === 0) {
    el.innerHTML = `<p style="color:var(--text-muted);font-size:13px;">No matching tokens.</p>`;
    return;
  }

  el.innerHTML = `
    <div style="overflow-x:auto;">
      <table class="data-table">
        <thead><tr><th>Code</th><th>Payer</th><th>Phone</th><th>Items</th><th>Amount</th><th>Amt Received</th><th>Status</th><th>Actions</th></tr></thead>
        <tbody>
          ${filtered.map(t => `
            <tr>
              <td style="font-size:12px;">${tokenDisplayCode(t)}</td>
              <td><strong>${t.payer_name}</strong></td>
              <td style="font-size:12px;">${t.phone || '—'}</td>
              <td>${countByToken[t.id] || 0}</td>
              <td><strong>${formatAmount(parseFloat(t.total_amount))}</strong></td>
              <td>
                ${t.status === 'pending' ? `
                  <input type="number" id="token-recd-${t.id}" placeholder="0" min="0" step="0.01"
                    style="width:100px;padding:4px 6px;border:1.5px solid var(--border);border-radius:6px;font-size:13px;font-weight:600;" />
                ` : '—'}
              </td>
              <td>${
                t.status === 'pending' ? '<span style="color:#ff9800;">Pending</span>' :
                t._printStatus ? `<span style="color:#6A1B9A;">🖨 ${t._printed}/${t._splitTotal} Printed</span>` :
                '<span style="color:#1565C0;">Paid — Split Pending</span>'
              }</td>
              <td>
                <div style="display:flex;gap:4px;flex-wrap:wrap;">
                  ${t.status === 'pending' ? `
                    <button class="btn-sm btn-primary" onclick="confirmTokenReceived('${t.id}', false)">✅ Print</button>
                    <button class="btn-sm btn-secondary" onclick="confirmTokenReceived('${t.id}', true)">✅ Split Later</button>
                    <button class="btn-sm btn-danger" onclick="cancelToken('${t.id}')">Cancel</button>
                  ` : t._printStatus ? `
                    <button class="btn-sm btn-primary" onclick="showTokenSplitsModal('${t.id}')">View &amp; Print Remaining</button>
                  ` : `
                    <button class="btn-sm btn-primary" onclick="showAllocateTokenModal('${t.id}')">Allocate &amp; Print</button>
                  `}
                  <button class="btn-sm btn-secondary" onclick="showTokenSlip('${t.id}')">🖨 Slip</button>
                </div>
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;
}

async function showTokenSplitsModal(tokenId) {
  const { data: splits, error } = await db.from('dr_token_splits').select('*').eq('token_id', tokenId).order('created_at');
  if (error || !splits) { showToast('Could not load splits', 'error'); return; }
  await showAllocationResultsModal(splits, tokenId);
}

// Cash admin enters ONE amount against the whole token — left blank rather
// than pre-filled, so the cashier has to actually type what they counted
// instead of confirming the total by reflex. That single figure cascades
// to every item under it, scaled proportionally, so nobody has to type an
// amount per line. Entering the full total (the normal case) means every
// item is marked fully received exactly as listed.
async function confirmTokenReceived(tokenId, splitLater) {
  const input = document.getElementById(`token-recd-${tokenId}`);
  const enteredAmount = input ? parseFloat(input.value) : NaN;
  if (!enteredAmount || enteredAmount <= 0) { showToast('Enter a valid received amount', 'error'); return; }

  const { data: lines, error: lErr } = await db.from('dr_donations').select('id, amount').eq('token_id', tokenId);
  if (lErr || !lines || lines.length === 0) { showToast('Could not load token items', 'error'); return; }

  const lineTotal = lines.reduce((s, l) => s + parseFloat(l.amount), 0);
  const ratio = enteredAmount / lineTotal;

  for (const line of lines) {
    const recd = Math.round(parseFloat(line.amount) * ratio * 100) / 100;
    const { error } = await db.from('dr_donations').update({ received_amount: recd }).eq('id', line.id);
    if (error) { showToast('Error: ' + error.message, 'error'); return; }
  }

  const newStatus = splitLater ? 'paid_awaiting_split' : 'paid';
  const { error: tErr } = await db.from('dr_receipt_tokens')
    .update({ status: newStatus, paid_at: new Date().toISOString() })
    .eq('id', tokenId);
  if (tErr) { showToast('Error: ' + tErr.message, 'error'); return; }

  showToast(splitLater ? '✅ Marked received — split & print whenever ready' : '✅ Received — opening receipt', 'success');
  await loadTokensList();
  if (!splitLater) showCombinedTokenReceipt(tokenId);
}

async function cancelToken(tokenId) {
  if (!confirm('Cancel this token? Its donation lines will be deleted too. This cannot be undone.')) return;
  const { error: dErr } = await db.from('dr_donations').delete().eq('token_id', tokenId);
  if (dErr) { showToast('Error: ' + dErr.message, 'error'); return; }
  const { error } = await db.from('dr_receipt_tokens').update({ status: 'cancelled' }).eq('id', tokenId).eq('org_id', currentOrgId);
  if (error) { showToast('Error: ' + error.message, 'error'); return; }
  showToast('Token cancelled');
  await loadTokensList();
}

async function showAllocateTokenModal(tokenId) {
  const { data: t, error } = await db.from('dr_receipt_tokens').select('*').eq('id', tokenId).single();
  if (error || !t) { showToast('Could not load token', 'error'); return; }

  showModal(`
    <div class="modal-title">Allocate Token — ${t.payer_name}</div>
    <div style="font-size:13px;color:var(--text-muted);margin-bottom:12px;">Total: ${formatAmount(parseFloat(t.total_amount))}</div>
    <div id="token-allocate-builder">${renderSplitRows('token-alloc-rows', t.total_amount, t.family_no, t.payer_name)}</div>
    <div class="modal-actions">
      <button class="btn-primary" onclick="saveTokenAllocation('${t.id}')">💾 Save Split</button>
      <button class="btn-secondary" onclick="closeModal()">Cancel</button>
    </div>
  `);
}

async function saveTokenAllocation(tokenId) {
  const rows = readSplitRows('token-alloc-rows');
  if (!rows) return;

  const records = rows.map(r => ({
    token_id: tokenId,
    org_id: currentOrgId,
    name: r.name,
    amount: r.amount,
    member_id: r.memberId,
    family_no: r.familyNo || null
  }));

  const { data: saved, error: insErr } = await db.from('dr_token_splits').insert(records).select();
  if (insErr) { showToast('Error: ' + insErr.message, 'error'); return; }

  const { error: updErr } = await db.from('dr_receipt_tokens')
    .update({ status: 'allocated', allocated_by: currentUser?.id || null, allocated_at: new Date().toISOString() })
    .eq('id', tokenId);
  if (updErr) { showToast('Error: ' + updErr.message, 'error'); return; }

  showToast(`✅ Allocated into ${saved.length} receipts`, 'success');
  await showAllocationResultsModal(saved.map(s => ({ ...s, receipt_no: null })), tokenId);
  await loadTokensList();
}

// A browser only allows one popup per user click — so rather than trying to
// auto-open every split receipt at once (which gets blocked after the
// first), list them with individual print buttons. Stays open on the same
// token (reload from DB) after each print so the ✅ Printed marker updates
// live — this is also what "View & Print Remaining" reopens later.
async function showAllocationResultsModal(splits, tokenId) {
  showModal(`
    <div class="modal-title">Split Receipts</div>
    <p style="font-size:13px;color:var(--text-muted);margin-bottom:10px;">Print each receipt:</p>
    ${splits.map(s => `
      <div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid var(--border);">
        <span>${s.name} — <strong>${formatAmount(parseFloat(s.amount))}</strong>${s.receipt_no ? ` <span style="font-size:11px;color:#4CAF50;">✅ Printed (#${s.receipt_no})</span>` : ''}</span>
        <button class="btn-sm btn-secondary" onclick="printSplitAndRefresh('${s.id}','${tokenId}')">🖨 ${s.receipt_no ? 'Reprint' : 'Print'}</button>
      </div>
    `).join('')}
    <div class="modal-actions"><button class="btn-secondary" onclick="closeModal(); loadTokensList();">Close</button></div>
  `);
}

async function printSplitAndRefresh(splitId, tokenId) {
  await showSplitReceipt(splitId);
  await showTokenSplitsModal(tokenId);
}
