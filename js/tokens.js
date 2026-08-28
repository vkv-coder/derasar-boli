// ==========================================
// DERASAR BOLI - Pending Tokens (Split-Receipt Allocation)
// Admin-only screen: allocate a "Payment Offer Accepted" token
// into individually-named receipts once the donor returns with names.
// ==========================================

async function renderTokens() {
  const content = document.getElementById('page-content');
  content.innerHTML = `
    <div class="card">
      <div class="card-title">🎫 Pending Tokens</div>
      <div class="form-group">
        <input type="text" id="token-search" placeholder="Search by name or phone..." oninput="loadPendingTokens()" />
      </div>
      <div id="tokens-list">Loading...</div>
    </div>
  `;
  await loadPendingTokens();
}

async function loadPendingTokens() {
  const el = document.getElementById('tokens-list');
  if (!el) return;

  const q = (document.getElementById('token-search')?.value || '').trim();
  let query = db.from('dr_receipt_tokens').select('*').eq('org_id', currentOrgId).eq('status', 'pending').order('created_at', { ascending: false });
  if (q) query = query.or(`payer_name.ilike.%${q}%,phone.ilike.%${q}%`);

  const { data, error } = await query;
  if (error) { el.innerHTML = `<p style="color:var(--danger);">Error: ${error.message}</p>`; return; }

  if (!data || data.length === 0) {
    el.innerHTML = `<p style="color:var(--text-muted);font-size:13px;">No pending tokens.</p>`;
    return;
  }

  el.innerHTML = `
    <div style="overflow-x:auto;">
      <table class="data-table">
        <thead><tr><th>Payer</th><th>Phone</th><th>Amount</th><th>Date</th><th>Actions</th></tr></thead>
        <tbody>
          ${data.map(t => `
            <tr>
              <td>${t.payer_name}</td>
              <td>${t.phone || '—'}</td>
              <td><strong>₹${parseFloat(t.total_amount).toLocaleString('en-IN')}</strong></td>
              <td style="font-size:12px;">${new Date(t.created_at).toLocaleDateString('en-IN')}</td>
              <td>
                <div style="display:flex;gap:4px;flex-wrap:wrap;">
                  <button class="btn-sm btn-primary" onclick="showAllocateTokenModal('${t.id}')">Allocate</button>
                  <button class="btn-sm btn-secondary" onclick="showTokenSlip('${t.id}')">🖨 Slip</button>
                  <button class="btn-sm btn-danger" onclick="cancelToken('${t.id}')">Cancel</button>
                </div>
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;
}

async function cancelToken(tokenId) {
  if (!confirm('Cancel this token? This cannot be undone.')) return;
  const { error } = await db.from('dr_receipt_tokens').update({ status: 'cancelled' }).eq('id', tokenId).eq('org_id', currentOrgId);
  if (error) { showToast('Error: ' + error.message, 'error'); return; }
  showToast('Token cancelled');
  await loadPendingTokens();
}

async function showAllocateTokenModal(tokenId) {
  const { data: t, error } = await db.from('dr_receipt_tokens').select('*').eq('id', tokenId).single();
  if (error || !t) { showToast('Could not load token', 'error'); return; }

  showModal(`
    <div class="modal-title">Allocate Token — ${t.payer_name}</div>
    <div style="font-size:13px;color:var(--text-muted);margin-bottom:12px;">Total: ₹${parseFloat(t.total_amount).toLocaleString('en-IN')}</div>
    <div id="token-allocate-builder">${renderSplitRows('token-alloc-rows', t.total_amount, t.family_no)}</div>
    <div class="modal-actions">
      <button class="btn-primary" onclick="saveTokenAllocation('${t.id}')">💾 Save & Generate Receipts</button>
      <button class="btn-secondary" onclick="closeModal()">Cancel</button>
    </div>
  `);
}

async function saveTokenAllocation(tokenId) {
  const rows = readSplitRows('token-alloc-rows');
  if (!rows) return;

  const { data: t, error: tErr } = await db.from('dr_receipt_tokens').select('*').eq('id', tokenId).single();
  if (tErr || !t) { showToast('Could not load token', 'error'); return; }

  const baseRecord = {
    org_id: t.org_id,
    event_id: t.event_id,
    head_type: t.head_type,
    swapna_id: t.swapna_id,
    swapna_item_id: t.swapna_item_id,
    general_head_id: t.general_head_id,
    entered_by: currentUser?.id || null
  };

  const records = rows.map(r => ({
    ...baseRecord,
    member_id: r.memberId,
    donor_name: r.name,
    receipt_name: r.name,
    family_no: r.familyNo || null,
    phone: null,
    amount: r.amount,
    mun_qty: t.rate_per_mun_used ? +(r.amount / t.rate_per_mun_used).toFixed(2) : null,
    rate_per_mun_used: t.rate_per_mun_used || null,
    is_split_row: true,
    split_token_id: t.id
  }));

  const { error: insErr } = await db.from('dr_donations').insert(records);
  if (insErr) { showToast('Error: ' + insErr.message, 'error'); return; }

  const { error: updErr } = await db.from('dr_receipt_tokens')
    .update({ status: 'allocated', allocated_by: currentUser?.id || null, allocated_at: new Date().toISOString() })
    .eq('id', tokenId);
  if (updErr) { showToast('Error: ' + updErr.message, 'error'); return; }

  closeModal();
  showToast(`✅ Allocated into ${records.length} receipts`, 'success');
  await loadPendingTokens();
}
