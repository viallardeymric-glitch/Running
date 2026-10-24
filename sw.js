/* RDD : service worker. L'app s'ouvre hors ligne ; les mises à jour arrivent au lancement suivant. */
const VERSION = 'rdd-2026-10-24';
const COQUILLE = ['./', './index.html', './manifest.webmanifest', './favicon.svg',
  './apple-touch-icon.png', './icon-192.png', './icon-512.png', './icon-maskable-512.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(COQUILLE)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(cles => Promise.all(cles.filter(k => k !== VERSION).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  // Strava, coach IA, cartes : toujours en direct.
  const cdn = /(cdn\.tailwindcss\.com|cdnjs\.cloudflare\.com|cdn\.jsdelivr\.net|unpkg\.com|fonts\.(googleapis|gstatic)\.com)$/.test(url.hostname);
  if (url.origin !== location.origin && !cdn) return;
  // Page : le réseau d'abord (dernière version), le cache si hors ligne.
  if (req.mode === 'navigate') {
    e.respondWith(fetch(req).then(r => { const copie = r.clone(); caches.open(VERSION).then(c => c.put('./index.html', copie)); return r; })
      .catch(() => caches.match('./index.html')));
    return;
  }
  // Fichiers et bibliothèques : le cache d'abord, rafraîchi en arrière-plan.
  e.respondWith(caches.match(req).then(enCache => {
    const reseau = fetch(req).then(r => {
      if (r && (r.ok || r.type === 'opaque')) { const copie = r.clone(); caches.open(VERSION).then(c => c.put(req, copie)); }
      return r;
    }).catch(() => enCache);
    return enCache || reseau;
  }));
});
