// ==========================================
// DERASAR BOLI - User Management
// ==========================================

async function renderUsers() {
  const content = document.getElementById('page-content');
  content.innerHTML = `
    <div class="card">
      <div class="section-header">
        <h3>👤 App Users</h3>
        <div style="display:flex;gap:8px;">
          <button class="btn-secondary btn-sm" onclick="showChangePasswordModal()">🔑 Change My Password</button>
          <button class="btn-accent btn-sm" onclick="showAddUserModal()">+ Add User</button>
        </div>
      </div>
      <div id="users-list">Loading...</div>
    </div>
  `;
  await loadUsersList();
}

async function loadUsersList() {
  const { data: users, error } = await db
    .from('profiles')
    .select('id, full_name, role, created_at')
    .eq('org_id', currentOrgId)
    .order('created_at');

  const el = document.getElementById('users-list');
  if (!users || users.length === 0) {
    el.innerHTML = `<div class="empty-state"><div class="empty-icon">👤</div><p>No users found.</p></div>`;
    return;
  }

  el.innerHTML = `
    <table class="data-table">
      <thead>
        <tr>
          <th>Name</th>
          <th>Role</th>
          <th>Actions</th>
        </tr>
      </thead>
      <tbody>
        ${users.map(u => `
          <tr>
            <td><div style="font-weight:600;">${u.full_name}</div></td>
            <td>
              <span class="badge ${u.role === 'admin' ? 'badge-swapna' : 'badge-general'}">
                ${u.role === 'admin' ? '🔑 Admin' : '✏️ Operator'}
              </span>
            </td>
            <td>
              <div style="display:flex;gap:6px;">
                ${u.id !== currentUser.id ? `
                  <button class="btn-sm btn-danger" onclick="deleteAppUser('${u.id}','${u.full_name}')">Remove</button>
                ` : '<span style="font-size:12px;color:var(--text-muted);">You</span>'}
              </div>
            </td>
          </tr>
        `).join('')}
      </tbody>
    </table>
    <p style="font-size:12px;color:var(--text-muted);margin-top:10px;">Total: ${users.length} users</p>
  `;
}

function showAddUserModal() {
  showModal(`
    <div class="modal-title">Add New User</div>
    <div class="form-group">
      <label>Full Name</label>
      <input type="text" id="new-user-name" placeholder="e.g. Rajesh Shah" />
    </div>
    <div class="form-group">
      <label>Email</label>
      <input type="email" id="new-user-email" placeholder="email@example.com" />
    </div>
    <div class="form-group">
      <label>Password</label>
      <input type="password" id="new-user-password" placeholder="Min 6 characters" />
    </div>
    <div class="form-group">
      <label>Role</label>
      <select id="new-user-role">
        <option value="operator">✏️ Operator (Donation Entry only)</option>
        <option value="admin">🔑 Admin (Full Access)</option>
      </select>
    </div>
    <div id="add-user-error" class="error-msg"></div>
    <div class="modal-actions">
      <button class="btn-primary" onclick="createAppUser()">Create User</button>
      <button class="btn-secondary" onclick="closeModal()">Cancel</button>
    </div>
  `);
}

async function createAppUser() {
  const full_name = document.getElementById('new-user-name').value.trim();
  const email     = document.getElementById('new-user-email').value.trim();
  const password  = document.getElementById('new-user-password').value.trim();
  const role      = document.getElementById('new-user-role').value;
  const errEl     = document.getElementById('add-user-error');

  if (!full_name || !email || !password) { errEl.textContent = 'Please fill all fields.'; return; }
  if (password.length < 6) { errEl.textContent = 'Password must be at least 6 characters.'; return; }

  errEl.textContent = 'Creating user...';

  const { data: { session } } = await db.auth.getSession();

  let response, rawText;
  try {
    response = await fetch(`${SUPABASE_URL}/functions/v1/create-user`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session.access_token}`,
        'apikey': SUPABASE_ANON_KEY
      },
      body: JSON.stringify({ email, password, full_name, role, org_id: currentOrgId })
    });
    rawText = await response.text();
  } catch (fetchErr) {
    errEl.textContent = 'Network error: ' + fetchErr.message;
    return;
  }

  if (!response.ok) {
    let msg = rawText;
    try { msg = JSON.parse(rawText).error || rawText; } catch(e) {}
    errEl.textContent = 'Error: ' + msg;
    return;
  }

  closeModal();
  showToast(`✅ User "${full_name}" created as ${role}!`, 'success');
  await loadUsersList();
}

function showChangePasswordModal() {
  showModal(`
    <div class="modal-title">🔑 Change My Password</div>
    <div class="form-group">
      <label>New Password</label>
      <input type="password" id="new-pwd" placeholder="Min 6 characters" />
    </div>
    <div class="form-group">
      <label>Confirm New Password</label>
      <input type="password" id="confirm-pwd" placeholder="Repeat new password" />
    </div>
    <div id="pwd-error" class="error-msg"></div>
    <div class="modal-actions">
      <button class="btn-primary" onclick="changeMyPassword()">Update Password</button>
      <button class="btn-secondary" onclick="closeModal()">Cancel</button>
    </div>
  `);
}

async function changeMyPassword() {
  const newPwd     = document.getElementById('new-pwd').value.trim();
  const confirmPwd = document.getElementById('confirm-pwd').value.trim();
  const errEl      = document.getElementById('pwd-error');

  if (!newPwd || !confirmPwd) { errEl.textContent = 'Please fill both fields.'; return; }
  if (newPwd.length < 6)      { errEl.textContent = 'Password must be at least 6 characters.'; return; }
  if (newPwd !== confirmPwd)  { errEl.textContent = 'Passwords do not match.'; return; }

  errEl.textContent = 'Updating...';
  const { error } = await db.auth.updateUser({ password: newPwd });
  if (error) { errEl.textContent = 'Error: ' + error.message; return; }
  closeModal();
  showToast('✅ Password updated successfully!', 'success');
}

async function deleteAppUser(id, name) {
  if (!confirm(`Remove "${name}" from this app? They will lose all access.`)) return;

  const { data: { session } } = await db.auth.getSession();

  let response, rawText;
  try {
    response = await fetch(`${SUPABASE_URL}/functions/v1/delete-user`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session.access_token}`,
        'apikey': SUPABASE_ANON_KEY
      },
      body: JSON.stringify({ userId: id })
    });
    rawText = await response.text();
  } catch (fetchErr) {
    showToast('Network error: ' + fetchErr.message, 'error');
    return;
  }

  if (!response.ok) {
    let msg = rawText;
    try { msg = JSON.parse(rawText).error || rawText; } catch(e) {}
    showToast('Error: ' + msg, 'error');
    return;
  }

  showToast(`"${name}" removed successfully.`, 'success');
  await loadUsersList();
}
