/* RDD : service worker. L'app s'ouvre hors ligne ; les mises à jour arrivent au lancement suivant. */
const VERSION = 'rdd-2026-11-03h';
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
  // Page : le réseau d'abord (dernière version). Réseau faible (départ de trail) : après 3 s, la copie locale
  // s'ouvre tout de suite et la nouvelle version, enregistrée en arrière-plan, servira au lancement suivant.
  if (req.mode === 'navigate') {
    const reseau = fetch(req).then(r => {
      if (r && r.ok && r.type === 'basic') { const copie = r.clone(); caches.open(VERSION).then(c => c.put('./index.html', copie)); }
      return r;
    });
    e.waitUntil(reseau.then(() => {}, () => {}));
    e.respondWith(new Promise(repondre => {
      let fini = false;
      const finir = r => { if (!fini && r) { fini = true; repondre(r); } return fini; };
      const local = () => caches.match('./index.html');
      const minuteur = setTimeout(() => local().then(finir), 3000);
      reseau.then(r => {
        clearTimeout(minuteur);
        if (r.ok) return finir(r);
        return local().then(c => finir(c || r));          // page d'erreur du serveur : la copie locale d'abord
      }).catch(() => local().then(c => finir(c || Response.error())));
    }));
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
