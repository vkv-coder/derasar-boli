// ==========================================
// DERASAR BOLI - App Controller
// ==========================================

let activeTab = '';

async function initApp() {
  showMainApp();
  await loadOrgBranding();
  const badge = document.getElementById('user-role-badge');
  badge.textContent = isAdmin() ? 'Admin' : 'Operator';
  buildNav();
  if (isAdmin()) {
    loadTab('events');
  } else {
    loadTab('entry');
  }
}

async function loadOrgBranding() {
  if (!currentOrgId) return;
  const { data } = await db.from('organizations').select('name, namah_text').eq('id', currentOrgId).single();
  if (data) {
    if (data.name) {
      document.querySelectorAll('.sangh-name').forEach(el => el.textContent = data.name);
    }
    if (data.namah_text) {
      document.querySelectorAll('.gujarati-text').forEach(el => el.textContent = data.namah_text);
    }
  }
}

function buildNav() {
  const nav = document.getElementById('nav-tabs');
  nav.innerHTML = '';

  const adminTabs = [
    { id: 'events', label: '📅 Events' },
    { id: 'heads', label: '📋 Heads Setup' },
    { id: 'members', label: '👥 Members' },
    { id: 'donors', label: '🤝 Donors' },
    { id: 'entry', label: '💰 Donation Entry' },
    { id: 'live', label: '🔴 Live View' },
    { id: 'reports', label: '📊 Reports' },
    { id: 'users', label: '👤 Users' },
  ];

  const operatorTabs = [
    { id: 'entry', label: '💰 Donation Entry' },
    { id: 'live', label: '🔴 Live View' },
  ];

  const tabs = isAdmin() ? adminTabs : operatorTabs;

  tabs.forEach(tab => {
    const el = document.createElement('div');
    el.className = 'nav-tab';
    el.textContent = tab.label;
    el.dataset.tab = tab.id;
    el.onclick = () => loadTab(tab.id);
    nav.appendChild(el);
  });
}

function loadTab(tabId) {
  activeTab = tabId;
  document.querySelectorAll('.nav-tab').forEach(t => {
    t.classList.toggle('active', t.dataset.tab === tabId);
  });

  const content = document.getElementById('page-content');
  content.innerHTML = '';

  switch (tabId) {
    case 'events':   renderEvents(); break;
    case 'heads':    renderHeads(); break;
    case 'members':  renderMembers(); break;
    case 'donors':   renderDonors(); break;
    case 'entry':    renderEntry(); break;
    case 'live':     renderLive(); break;
    case 'reports':  renderReports(); break;
    case 'users':    renderUsers(); break;
  }
}

// ========== TOAST ==========
function showToast(msg, type = '') {
  const toast = document.getElementById('toast');
  toast.textContent = msg;
  toast.className = 'toast show ' + type;
  setTimeout(() => { toast.className = 'toast'; }, 3000);
}

// ========== MODAL ==========
function showModal(html) {
  document.getElementById('modal-box').innerHTML = html;
  document.getElementById('modal-overlay').style.display = 'flex';
}

function closeModal() {
  document.getElementById('modal-overlay').style.display = 'none';
}

document.addEventListener('click', function(e) {
  if (e.target.id === 'modal-overlay') closeModal();
});

// ========== UTILS ==========
function formatAmount(n) {
  return '₹' + Number(n).toLocaleString('en-IN', { minimumFractionDigits: 0 });
}

function formatDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}
