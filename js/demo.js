// ==========================================
// DERASAR BOLI - Demo Mode
// ==========================================

const DEMO_ORG_ID = 'd3d3d3d3-1111-2222-3333-444455556666';

// Best-effort Telegram alert to the admin via the shared relay worker —
// never blocks demo entry if it fails (offline, worker down, etc.)
function notifyDemoTrial(name, phone) {
  try {
    fetch('https://telegram-notify.unigoods2026.workers.dev/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        msg: '🛕 New Derasar Boli demo trial\n\nName: ' + name + '\nPhone: ' + phone
      })
    }).catch(function () {});
  } catch (e) {}
}

async function enterDemo() {
  const name = document.getElementById('demo-name').value.trim();
  const phone = document.getElementById('demo-phone').value.trim();
  const msgEl = document.getElementById('demo-msg');
  msgEl.textContent = '';

  if (!name) {
    msgEl.textContent = 'Please enter your name.';
    return;
  }
  if (phone.length !== 10 || !/^[0-9]+$/.test(phone)) {
    msgEl.textContent = 'Enter a valid 10-digit phone number.';
    return;
  }

  const btn = document.getElementById('demo-btn');
  btn.disabled = true;
  btn.textContent = 'Loading...';

  // Log the visit (best-effort — demo still works even if this fails)
  await db.from('dr_demo_visitors').insert({ name, phone });
  notifyDemoTrial(name, phone);

  // Set up a fake view-only session — no real login needed
  window.isDemoMode = true;
  currentUser = null;
  currentProfile = { role: 'admin', full_name: 'Demo Visitor', status: 'approved', org_id: DEMO_ORG_ID };
  currentOrgId = DEMO_ORG_ID;

  document.getElementById('demo-entry-screen').style.display = 'none';
  document.getElementById('main-screen').style.display = 'block';
  initApp();
}
