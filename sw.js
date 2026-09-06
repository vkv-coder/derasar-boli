// ==========================================
// DERASAR BOLI - Service Worker
// ==========================================

const CACHE_NAME = 'derasar-boli-v72';
const ASSETS = [
  '/',
  '/index.html',
  '/signup.html',
  '/demo.html',
  '/css/style.css',
  '/js/config.js',
  '/js/auth.js',
  '/js/app.js',
  '/js/events.js',
  '/js/heads.js',
  '/js/functions.js',
  '/js/members.js',
  '/js/splits.js',
  '/js/donations.js',
  '/js/tokens.js',
  '/js/reports.js',
  '/js/reports-page.js',
  '/js/receipt.js',
  '/js/card.js',
  '/js/donors.js',
  '/js/users.js',
  '/js/signup.js',
  '/js/demo.js',
  '/manifest.json',
  '/temple.png',
  '/jin-pratik.png'
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  if (e.request.url.includes('supabase.co')) return; // Don't cache API calls
  if (e.request.method !== 'GET') return;

  // Network-first: always try to get the latest file so deploys reach
  // clients immediately. Fall back to cache only when offline.
  e.respondWith(
    fetch(e.request)
      .then(res => {
        const resClone = res.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(e.request, resClone));
        return res;
      })
      .catch(() => caches.match(e.request))
  );
});
