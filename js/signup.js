// ==========================================
// DERASAR BOLI - New Sangh Signup
// ==========================================

async function submitSignup() {
  const sanghName = document.getElementById('signup-sangh-name').value.trim();
  const email = document.getElementById('signup-email').value.trim();
  const phone = document.getElementById('signup-phone').value.trim();
  const password = document.getElementById('signup-password').value.trim();
  const confirmPw = document.getElementById('signup-confirm-password').value.trim();
  const msgEl = document.getElementById('signup-msg');
  msgEl.textContent = '';

  if (!sanghName || !email || !phone || !password || !confirmPw) {
    msgEl.textContent = 'Please fill all fields.';
    return;
  }
  if (phone.length !== 10 || !/^[0-9]+$/.test(phone)) {
    msgEl.textContent = 'Enter a valid 10-digit phone number.';
    return;
  }
  if (password.length < 6) {
    msgEl.textContent = 'Password must be at least 6 characters.';
    return;
  }
  if (password !== confirmPw) {
    msgEl.textContent = 'Passwords do not match.';
    return;
  }

  const btn = document.getElementById('signup-btn');
  btn.disabled = true;
  btn.textContent = 'Submitting...';

  // 1. Create organization (pending approval)
  const { data: orgData, error: orgErr } = await db
    .from('organizations')
    .insert({ name: sanghName, short_name: sanghName, status: 'pending' })
    .select()
    .single();

  if (orgErr) {
    msgEl.textContent = 'Error: ' + orgErr.message;
    btn.disabled = false;
    btn.textContent = 'Submit Registration';
    return;
  }

  // 2. Create login (auth) user
  const { data: authData, error: authErr } = await db.auth.signUp({ email, password });

  if (authErr) {
    msgEl.textContent = 'Error: ' + authErr.message;
    btn.disabled = false;
    btn.textContent = 'Submit Registration';
    return;
  }

  // 3. Create profile linked to new org, pending approval, as Admin
  const { error: profErr } = await db.from('profiles').insert({
    id: authData.user.id,
    full_name: sanghName,
    role: 'admin',
    org_id: orgData.id,
    status: 'pending',
    phone: phone
  });

  if (profErr) {
    msgEl.textContent = 'Error: ' + profErr.message;
    btn.disabled = false;
    btn.textContent = 'Submit Registration';
    return;
  }

  // Sign out so they don't land in the app while pending
  await db.auth.signOut();

  document.querySelectorAll('.login-box .form-group, .login-box button.btn-primary').forEach(el => el.style.display = 'none');
  document.getElementById('signup-success').style.display = 'block';
}
