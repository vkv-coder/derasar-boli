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

  setSubmitting(true);

  // Step 1: try creating a new login
  let userId = null;
  const { data: signUpData, error: signUpErr } = await db.auth.signUp({ email, password });

  if (signUpErr && signUpErr.message && signUpErr.message.toLowerCase().includes('already registered')) {
    // Step 2: email already has a login (maybe from another of your apps) — verify it's really them
    const { data: signInData, error: signInErr } = await db.auth.signInWithPassword({ email, password });
    if (signInErr) {
      msgEl.textContent = 'This email is already registered with a different password. Enter the correct password for that account, or use a different email.';
      setSubmitting(false);
      return;
    }
    userId = signInData.user.id;

    // Step 3: make sure this login isn't already running a Sangh here
    const { data: existingProfile } = await db.from('profiles').select('id').eq('id', userId).maybeSingle();
    if (existingProfile) {
      msgEl.textContent = 'This email is already linked to a Sangh on Derasar Boli. One login can manage only one Sangh. Contact support to add another Sangh.';
      await db.auth.signOut();
      setSubmitting(false);
      return;
    }
  } else if (signUpErr) {
    msgEl.textContent = 'Error: ' + signUpErr.message;
    setSubmitting(false);
    return;
  } else {
    userId = signUpData.user.id;
  }

  // Step 4: create organization (pending approval)
  const { data: orgData, error: orgErr } = await db
    .from('organizations')
    .insert({ name: sanghName, short_name: sanghName, status: 'pending' })
    .select()
    .single();

  if (orgErr) {
    msgEl.textContent = 'Error: ' + orgErr.message;
    setSubmitting(false);
    return;
  }

  // Step 5: create profile linked to new org, pending approval, as Admin
  const { error: profErr } = await db.from('profiles').insert({
    id: userId,
    full_name: sanghName,
    role: 'admin',
    org_id: orgData.id,
    status: 'pending',
    phone: phone
  });

  if (profErr) {
    msgEl.textContent = 'Error: ' + profErr.message;
    setSubmitting(false);
    return;
  }

  await db.auth.signOut();

  document.querySelectorAll('.login-box .form-group, .login-box button.btn-primary').forEach(el => el.style.display = 'none');
  document.getElementById('signup-success').style.display = 'block';
}

function setSubmitting(isSubmitting) {
  const btn = document.getElementById('signup-btn');
  btn.disabled = isSubmitting;
  btn.textContent = isSubmitting ? 'Submitting...' : 'Submit Registration';
}
