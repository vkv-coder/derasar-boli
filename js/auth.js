// ==========================================
// DERASAR BOLI - Auth
// ==========================================

let currentUser = null;
let currentProfile = null;
let currentOrgId = null;

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

  const blocked = await checkProfileAccess(errEl);
  if (blocked) return;

  showMainApp();
  initApp();
}

async function checkProfileAccess(errEl) {
  if (!currentProfile) {
    if (errEl) errEl.textContent = 'Account setup incomplete. Contact support: vkvcoder.support@gmail.com';
    await db.auth.signOut();
    currentUser = null;
    return true;
  }
  if (currentProfile.status === 'pending') {
    if (errEl) errEl.textContent = 'Your Sangh registration is pending approval. Contact support: vkvcoder.support@gmail.com / 9327243611';
    await db.auth.signOut();
    currentUser = null;
    currentProfile = null;
    return true;
  }
  currentOrgId = currentProfile.org_id;
  return false;
}

async function logout() {
  await db.auth.signOut();
  currentUser = null;
  currentProfile = null;
  currentOrgId = null;
  const loginScreen = document.getElementById('login-screen');
  const mainScreen = document.getElementById('main-screen');
  if (loginScreen) loginScreen.style.display = 'flex';
  if (mainScreen) mainScreen.style.display = 'none';
  const emailEl = document.getElementById('login-email');
  const pwEl = document.getElementById('login-password');
  if (emailEl) emailEl.value = '';
  if (pwEl) pwEl.value = '';
}

async function loadProfile() {
  const { data } = await db
    .from('dr_profiles')
    .select('*')
    .eq('id', currentUser.id)
    .single();
  currentProfile = data;
}

function isAdmin() {
  return currentProfile && currentProfile.role === 'admin';
}

function showMainApp() {
  const loginScreen = document.getElementById('login-screen');
  const demoScreen = document.getElementById('demo-entry-screen');
  const mainScreen = document.getElementById('main-screen');
  if (loginScreen) loginScreen.style.display = 'none';
  if (demoScreen) demoScreen.style.display = 'none';
  if (mainScreen) mainScreen.style.display = 'block';
}

// Check session on load (skipped entirely on demo.html — no login-screen present)
window.addEventListener('load', async () => {
  if (!document.getElementById('login-screen')) return;
  const { data } = await db.auth.getSession();
  if (data.session) {
    currentUser = data.session.user;
    await loadProfile();
    const blocked = await checkProfileAccess(document.getElementById('login-error'));
    if (blocked) return;
    showMainApp();
    initApp();
  }
});

// Forgot password functions
function showForgotPassword(){
  var m=document.getElementById('forgotModal');
  if(m){m.style.display='flex';}
  var e=document.getElementById('forgotEmail');
  if(e)e.value='';
  var msg=document.getElementById('forgotMsg');
  if(msg)msg.style.display='none';
}
function hideForgotPassword(){
  var m=document.getElementById('forgotModal');
  if(m)m.style.display='none';
}
async function sendForgotPassword(){
  var email=document.getElementById('forgotEmail').value.trim();
  var msg=document.getElementById('forgotMsg');
  if(!email){msg.textContent='Please enter your email.';msg.style.color='#D32F2F';msg.style.display='block';return;}
  var{error}=await db.auth.resetPasswordForEmail(email,{redirectTo:window.location.origin+window.location.pathname.replace(/[^\/]*$/,'')+'reset-password.html'});
  if(error){msg.textContent='Error: '+error.message;msg.style.color='#D32F2F';}
  else{msg.textContent='Reset link sent! Check your email.';msg.style.color='#2E7D32';}
  msg.style.display='block';
}
async function confirmNewPassword(){
  var newPass=document.getElementById('newPassInput').value;
  var confirm=document.getElementById('newPassConfirm').value;
  var msg=document.getElementById('newPassMsg');
  if(!newPass||newPass.length<6){msg.textContent='Password must be at least 6 characters.';msg.style.display='block';return;}
  if(newPass!==confirm){msg.textContent='Passwords do not match.';msg.style.display='block';return;}
  var{error}=await db.auth.updateUser({password:newPass});
  if(error){msg.textContent='Error: '+error.message;msg.style.display='block';return;}
  var m=document.getElementById('newPassModal');
  if(m)m.style.display='none';
  await db.auth.signOut();
  alert('Password updated! Please login with your new password.');
  window.location.reload();
}

// Handle PASSWORD_RECOVERY event
db.auth.onAuthStateChange(function(event,session){
  if(event==='PASSWORD_RECOVERY'){
    var m=document.getElementById('newPassModal');
    if(m)m.style.display='flex';
  }
});
