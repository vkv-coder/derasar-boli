// ==========================================
// DERASAR BOLI - Service Worker
// ==========================================

const CACHE_NAME = 'derasar-boli-v8';
const ASSETS = [
  '/derasar-boli/',
  '/derasar-boli/index.html',
  '/derasar-boli/css/style.css',
  '/derasar-boli/js/config.js',
  '/derasar-boli/js/auth.js',
  '/derasar-boli/js/app.js',
  '/derasar-boli/js/events.js',
  '/derasar-boli/js/heads.js',
  '/derasar-boli/js/members.js',
  '/derasar-boli/js/donations.js',
  '/derasar-boli/js/reports.js',
  '/derasar-boli/js/reports-page.js',
  '/derasar-boli/js/receipt.js',
  '/derasar-boli/manifest.json'
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
  e.respondWith(
    caches.match(e.request).then(cached => cached || fetch(e.request))
  );
});
