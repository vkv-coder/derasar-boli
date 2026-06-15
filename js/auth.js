// ==========================================
// DERASAR BOLI - Auth
// ==========================================

let currentUser = null;
let currentProfile = null;

async function login() {
  const email = document.getElementById('login-email').value.trim();
  const password = document.getElementById('login-password').value.trim();
  const errEl = document.getElementById('login-error');
  errEl.textContent = '';

  if (!email || !password) {
    errEl.textContent = 'Please enter email and password.';
    return;
  }

  const { data, error } = await db.auth.signInWithPassword({ email, password });
  if (error) { errEl.textContent = error.message; return; }

  currentUser = data.user;
  await loadProfile();
  showMainApp();
  initApp();
}

async function logout() {
  await db.auth.signOut();
  currentUser = null;
  currentProfile = null;
  document.getElementById('login-screen').style.display = 'flex';
  document.getElementById('main-screen').style.display = 'none';
  document.getElementById('login-email').value = '';
  document.getElementById('login-password').value = '';
}

async function loadProfile() {
  const { data } = await db
    .from('profiles')
    .select('*')
    .eq('id', currentUser.id)
    .single();
  currentProfile = data;
}

function isAdmin() {
  return currentProfile && currentProfile.role === 'admin';
}

function showMainApp() {
  document.getElementById('login-screen').style.display = 'none';
  document.getElementById('main-screen').style.display = 'block';
}

// Check session on load
window.addEventListener('load', async () => {
  const { data } = await db.auth.getSession();
  if (data.session) {
    currentUser = data.session.user;
    await loadProfile();
    showMainApp();
    initApp();
  }
});
