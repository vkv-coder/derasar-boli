// ==========================================
// DERASAR BOLI - App Controller
// ==========================================

let activeTab = '';

// ========== DEMO MODE LOCK ==========
(function setupDemoLock() {
  if (typeof db === 'undefined') return;
  const originalFrom = db.from.bind(db);
  db.from = function(table) {
    const builder = originalFrom(table);
    if (window.isDemoMode) {
      ['insert', 'update', 'delete', 'upsert'].forEach(method => {
        const orig = builder[method].bind(builder);
        builder[method] = function(...args) {
          const result = orig(...args);
          result.then = function(resolve) {
            showToast('🔒 Demo Mode — this action is not saved', 'error');
            resolve({ data: null, error: { message: 'Demo mode: action disabled' } });
            return Promise.resolve();
          };
          return result;
        };
      });
    }
    return builder;
  };
})();

async function initApp() {
  showMainApp();
  await loadOrgBranding();
  const badge = document.getElementById('user-role-badge');
  badge.textContent = window.isDemoMode ? 'Demo' : (isAdmin() ? 'Admin' : 'Operator');
  buildNav();
  if (window.isDemoMode) {
    loadTab('guide');
  } else if (isAdmin()) {
    loadTab('events');
  } else {
    loadTab('entry');
  }
  checkFamilyDeepLink();
}

// Membership Card QR opens the app with ?family=<no> — if we're logged in
// as admin, jump straight to that family's outstanding-donations view.
function checkFamilyDeepLink() {
  const familyNo = new URLSearchParams(window.location.search).get('family');
  if (familyNo && isAdmin() && typeof showFamilyOutstanding === 'function') {
    showFamilyOutstanding(familyNo);
  }
}

async function loadOrgBranding() {
  if (!currentOrgId) return;
  const { data, error } = await db.from('dr_organizations').select('name, namah_text').eq('id', currentOrgId).single();
  if (error) console.error('loadOrgBranding failed:', error.message);
  if (data) {
    document.querySelectorAll('.sangh-name').forEach(el => el.textContent = data.name || '');
    document.querySelectorAll('.gujarati-text').forEach(el => el.textContent = data.namah_text || '');
  }
}

function buildNav() {
  const nav = document.getElementById('nav-tabs');
  nav.innerHTML = '';

  const adminTabs = [
    { id: 'events', label: '📅 Events' },
    { id: 'heads', label: '📋 Heads Setup' },
    { id: 'members', label: '👥 Members' },
    { id: 'entry', label: '💰 Donation Entry' },
    { id: 'live', label: '🔴 Live View' },
    { id: 'reports', label: '📊 Reports' },
    { id: 'users', label: '👤 Users' },
  ];

  const operatorTabs = [
    { id: 'entry', label: '💰 Donation Entry' },
  ];

  const tabs = isAdmin() ? adminTabs : operatorTabs;
  if (window.isDemoMode) tabs.unshift({ id: 'guide', label: 'ℹ️ How This Works' });

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
    case 'guide':    renderGuide(); break;
    case 'events':   renderEvents(); break;
    case 'heads':    renderHeads(); break;
    case 'members':  renderMembers(); break;
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
  // Errors need longer on screen to actually be read (and reported back) -
  // 3s was the same for every toast, so a real error message ("del member
  // shows some error") flashed and vanished before it could even be read.
  setTimeout(() => { toast.className = 'toast'; }, type === 'error' ? 8000 : 3000);
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

// ========== DEMO ORIENTATION TAB (demo-mode only, see buildNav/initApp) ==========
function renderGuide() {
  const content = document.getElementById('page-content');
  content.innerHTML = `
    <div class="card">
      <div class="card-title">👋 Welcome — How This Demo Works</div>
      <p style="font-size:13.5px;line-height:1.7;">
        Derasar Boli is a complete digital system for running your Sangh's boli
        (auction), donations, membership, and accounts — from the collection
        counter during Paryushan right through to the final Sangh-wide total.
        You're looking at a sample Sangh, already filled in with real-looking
        families, donations, and receipts, so you can click around and see
        exactly what your own Sangh's data would look like.
      </p>
      <p style="font-size:13.5px;line-height:1.7;background:#FFF3CD;color:#7B3F00;padding:8px 10px;border-radius:8px;font-weight:600;">
        🔒 Nothing you do here is saved. Explore freely — add a donation, delete
        a member, try anything. It all resets, and nothing ever touches a real
        Sangh's data.
      </p>
    </div>

    <div class="card">
      <div class="card-title">✅ Things to try</div>
      <div style="display:flex;flex-direction:column;gap:10px;">
        <div>
          <strong>💰 Donation Entry</strong>
          <div style="font-size:12.5px;color:var(--text-muted);">Choose "Member" as donor type and use the <strong>Quick Pick</strong> dropdown to select a sample family — no need to know a name to search for. Add a boli or donation, then "Generate Token" and print or WhatsApp-share the receipt.</div>
        </div>
        <div>
          <strong>📋 Heads Setup</strong>
          <div style="font-size:12.5px;color:var(--text-muted);">See a full real Paryushan head structure already set up — all 14 Swapna, Kalp Sutra, Guru Pujan, general heads like Devdravya/Gyaan/Jivdaya — and how Rupees/Mun/Aani units and categories are managed.</div>
        </div>
        <div>
          <strong>👥 Members</strong>
          <div style="font-size:12.5px;color:var(--text-muted);">Browse the sample family list, open a family's Membership Card, and see the full roster used for "Receipt In Name Of".</div>
        </div>
        <div>
          <strong>📊 Reports &amp; 🔴 Live View</strong>
          <div style="font-size:12.5px;color:var(--text-muted);">See live running totals, pending vs. collected amounts, and category-wise/item-wise summaries — exactly what you'd show your trustees.</div>
        </div>
        <div>
          <strong>🎟 Event Passes</strong>
          <div style="font-size:12.5px;color:var(--text-muted);">Set up a Swamivatsalya or function pass and control how many of a family's members get one.</div>
        </div>
      </div>
    </div>

    <div class="card">
      <div class="card-title">🙏 Want this for your own Sangh?</div>
      <p style="font-size:13px;line-height:1.6;">No approval was needed for this demo — but to actually run your Sangh's real collections, you'll register your Sangh (quick signup) and it gets approved so your data stays private to only your own team.</p>
      <p style="font-size:13px;line-height:1.8;">
        📞 <strong>9327243611</strong><br/>
        📧 <strong>vkvcoder.support@gmail.com</strong>
      </p>
    </div>
  `;
}
