/**
 * Service worker FinPrep : rend l'application utilisable avec une connexion instable.
 * - Interface (HTML/CSS/JS) : servie depuis le cache, mise à jour en arrière-plan.
 * - API en lecture (catalogue, tableau de bord, questions de quiz) : réseau d'abord, cache en secours.
 * - PDF : jamais mis en cache ici, l'étudiant les télécharge sur son appareil.
 */
const VERSION = 'v1';
const SHELL_CACHE = `finprep-shell-${VERSION}`;
const API_CACHE = 'finprep-api';
const SHELL = ['/', '/index.html', '/style.css', '/app.js', '/api.js', '/ui.js', '/views.js', '/admin-ui.js', '/manifest.json', '/icon.svg'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(SHELL_CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('finprep-shell-') && k !== SHELL_CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

const offlineJson = () =>
  new Response(JSON.stringify({ error: 'Vous êtes hors-ligne et ce contenu n’a pas encore été ouvert sur cet appareil.' }), {
    status: 503, headers: { 'Content-Type': 'application/json' },
  });

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;

  if (url.pathname.startsWith('/api/')) {
    // Contenu sensible ou volumineux : jamais en cache
    // (/api/auth/me reste en cache pour que l'étudiant reste connecté hors-ligne)
    if (url.pathname.endsWith('/pdf') || url.pathname.startsWith('/api/admin')) return;
    event.respondWith(
      fetch(request)
        .then((res) => {
          if (res.ok) { const copy = res.clone(); caches.open(API_CACHE).then((c) => c.put(request, copy)); }
          return res;
        })
        .catch(() => caches.match(request).then((hit) => hit || offlineJson()))
    );
    return;
  }

  // Interface : cache d'abord, puis rafraîchissement en arrière-plan (stale-while-revalidate)
  event.respondWith(
    caches.match(request).then((hit) => {
      const network = fetch(request)
        .then((res) => {
          if (res.ok) { const copy = res.clone(); caches.open(SHELL_CACHE).then((c) => c.put(request, copy)); }
          return res;
        })
        .catch(() => hit || caches.match('/index.html'));
      return hit || network;
    })
  );
});

// À la déconnexion, l'application demande de vider le cache API (appareil partagé).
self.addEventListener('message', (event) => {
  if (event.data === 'clear-api-cache') caches.delete(API_CACHE);
});
