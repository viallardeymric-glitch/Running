/* ==================================================================================
   RDD, Runner du dimanche : service worker
   - rend l'app installable comme une vraie application sur Android (Samsung Internet l'exige ;
     Chrome en a besoin pour proposer l'installation de lui-même) ;
   - garde une copie de l'app et de ses bibliothèques pour l'ouvrir sans réseau.
   Les appels aux IA (Gemini, Claude), à Strava et au relais ne passent jamais par le cache.
   Pour publier une nouvelle version de l'app, il suffit de remplacer index.html : la page est
   toujours chargée depuis le réseau en priorité.
   ================================================================================== */
const VERSION = 'rdd-2026-10-02';
const CACHE_APP = VERSION + '-app';
const CACHE_BIBLIOTHEQUES = VERSION + '-bibliotheques';
const FICHIERS_APP = ['./', './index.html', './manifest.webmanifest', './icone-192.png', './icone-512.png',
                      './icone-maskable-512.png', './apple-touch-icon.png'];
const HOTES_BIBLIOTHEQUES = ['cdn.tailwindcss.com', 'cdnjs.cloudflare.com', 'fonts.googleapis.com', 'fonts.gstatic.com'];

self.addEventListener('install', evenement => {
  evenement.waitUntil((async () => {
    const cache = await caches.open(CACHE_APP);
    // Fichier par fichier : un fichier absent n'empêche pas l'installation.
    await Promise.all(FICHIERS_APP.map(f => cache.add(new Request(f, { cache: 'reload' })).catch(() => null)));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', evenement => {
  evenement.waitUntil((async () => {
    const noms = await caches.keys();
    await Promise.all(noms.filter(n => n.startsWith('rdd-') && !n.startsWith(VERSION)).map(n => caches.delete(n)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', evenement => {
  const requete = evenement.request;
  if (requete.method !== 'GET') return;                      // envois de données : jamais interceptés
  const url = new URL(requete.url);
  if (url.origin === self.location.origin) {
    evenement.respondWith(requete.mode === 'navigate' ? pageReseauDAbord(requete) : fichierCacheDAbord(requete));
    return;
  }
  if (HOTES_BIBLIOTHEQUES.includes(url.hostname)) evenement.respondWith(bibliotheque(evenement));
  // Tout le reste (Gemini, Claude, Strava, relais) : réseau direct.
});

/** La page : réseau d'abord (nouvelle version immédiate), copie locale si le réseau manque. */
async function pageReseauDAbord(requete) {
  const cache = await caches.open(CACHE_APP);
  const url = new URL(requete.url);
  const cle = url.origin + url.pathname;                     // sans paramètres (retour Strava, raccourcis)
  try {
    const reponse = await fetch(requete);
    if (reponse.ok) await cache.put(cle, reponse.clone());
    return reponse;
  } catch (e) {
    return (await cache.match(cle)) || (await cache.match(requete, { ignoreSearch: true })) ||
           (await cache.match('./index.html')) || (await cache.match('./')) || Response.error();
  }
}

/** Icônes et manifeste : copie locale d'abord, réseau sinon. */
async function fichierCacheDAbord(requete) {
  const cache = await caches.open(CACHE_APP);
  const enCache = await cache.match(requete, { ignoreSearch: true });
  if (enCache) return enCache;
  const reponse = await fetch(requete);
  if (reponse.ok) await cache.put(requete, reponse.clone());
  return reponse;
}

/** Bibliothèques et polices : copie locale tout de suite, mise à jour en arrière-plan. */
async function bibliotheque(evenement) {
  const requete = evenement.request;
  const cache = await caches.open(CACHE_BIBLIOTHEQUES);
  const enCache = await cache.match(requete);
  const reseau = fetch(requete).then(async reponse => {
    if (reponse.ok || reponse.type === 'opaque') await cache.put(requete, reponse.clone());
    return reponse;
  }).catch(() => null);
  evenement.waitUntil(reseau);
  return enCache || (await reseau) || Response.error();
}
