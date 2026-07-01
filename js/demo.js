// ==========================================
// DERASAR BOLI - Demo Mode
// ==========================================

const DEMO_ORG_ID = 'd3d3d3d3-1111-2222-3333-444455556666';

async function enterDemo() {
  const phone = document.getElementById('demo-phone').value.trim();
  const msgEl = document.getElementById('demo-msg');
  msgEl.textContent = '';

  if (phone.length !== 10 || !/^[0-9]+$/.test(phone)) {
    msgEl.textContent = 'Enter a valid 10-digit phone number.';
    return;
  }

  const btn = document.getElementById('demo-btn');
  btn.disabled = true;
  btn.textContent = 'Loading...';

  // Log the visit (best-effort — demo still works even if this fails)
  await db.from('demo_visitors').insert({ phone });

  // Set up a fake view-only session — no real login needed
  window.isDemoMode = true;
  currentUser = null;
  currentProfile = { role: 'admin', full_name: 'Demo Visitor', status: 'approved', org_id: DEMO_ORG_ID };
  currentOrgId = DEMO_ORG_ID;

  document.getElementById('demo-entry-screen').style.display = 'none';
  document.getElementById('main-screen').style.display = 'block';
  initApp();
}
