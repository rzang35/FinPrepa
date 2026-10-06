/**
 * Point d'entrée : routeur à base de hash (#/...), navigation, session, mode hors-ligne.
 * Le routage par hash permet un hébergement statique simple, sans configuration serveur.
 */
import { api } from './api.js';
import { esc, toast } from './ui.js';
import { viewHome, viewModule, viewLogin, viewRegister, viewDashboard, viewQuiz } from './views.js';
import { adminModules, adminModuleEdit, adminEnrollments } from './admin-ui.js';

const app = document.getElementById('app');
const nav = document.getElementById('nav');
const menuToggle = document.getElementById('menu-toggle');

// [motif, vue, accès requis]
const routes = [
  [/^\/$/, viewHome],
  [/^\/module\/(\d+)$/, viewModule],
  [/^\/login$/, viewLogin, 'guest'],
  [/^\/register$/, viewRegister, 'guest'],
  [/^\/dashboard$/, viewDashboard, 'auth'],
  [/^\/quiz\/(\d+)$/, viewQuiz, 'auth'],
  [/^\/admin$/, adminModules, 'admin'],
  [/^\/admin\/module\/new$/, adminModuleEdit, 'admin'],
  [/^\/admin\/module\/(\d+)$/, adminModuleEdit, 'admin'],
  [/^\/admin\/enrollments$/, adminEnrollments, 'admin'],
];

const ctx = {
  user: null,
  config: { paymentInstructions: '', autoEnroll: false },
  setUser(user) { ctx.user = user; renderNav(); },
  go(path) {
    if (location.hash === `#${path}`) render();
    else location.hash = path;
  },
  reload: () => render(),
};

function currentPath() {
  const [path, query] = location.hash.slice(1).split('?');
  return { path: path.startsWith('/') ? path : '/', params: new URLSearchParams(query || '') };
}

function renderNav() {
  const { path } = currentPath();
  const link = (href, label, match) => `<a href="#${href}" ${match ? 'aria-current="page"' : ''}>${label}</a>`;
  const u = ctx.user;
  nav.innerHTML = [
    link('/', 'Catalogue', path === '/' || path.startsWith('/module')),
    u && link('/dashboard', 'Mon espace', path === '/dashboard' || path.startsWith('/quiz')),
    u?.role === 'admin' && link('/admin', 'Administration', path.startsWith('/admin')),
    u ? `<button type="button" id="logout" title="${esc(u.email)}">Se déconnecter</button>` : link('/login', 'Se connecter', path === '/login'),
    !u && `<a href="#/register" class="nav-cta">Créer un compte</a>`,
  ].filter(Boolean).join('');
}

async function render() {
  const { path, params } = currentPath();
  nav.classList.remove('open');
  menuToggle.setAttribute('aria-expanded', 'false');

  let match;
  const route = routes.find(([re]) => (match = path.match(re)));
  if (!route) {
    app.innerHTML = `<div class="panel empty"><h1>Page introuvable</h1><a class="btn btn-primary" href="#/">Retour au catalogue</a></div>`;
    return renderNav();
  }
  const [, view, access] = route;

  // Contrôle d'accès côté interface (le serveur vérifie de toute façon chaque requête)
  if (access === 'auth' && !ctx.user) return ctx.go(`/login?next=${encodeURIComponent(path)}`);
  if (access === 'admin' && ctx.user?.role !== 'admin') return ctx.go(ctx.user ? '/dashboard' : '/login');
  if (access === 'guest' && ctx.user) return ctx.go(ctx.user.role === 'admin' ? '/admin' : '/dashboard');

  renderNav();
  app.innerHTML = '<p class="loading">Chargement…</p>';
  try {
    const args = match.slice(1);
    const result = await view(ctx, ...(args.length ? args : [params]));
    // Si la route a changé pendant le chargement, on abandonne ce rendu
    if (currentPath().path !== path) return;
    app.innerHTML = result.html;
    result.mount?.(app);
  } catch (err) {
    if (err.status === 401) {
      ctx.user = null;
      return ctx.go(`/login?next=${encodeURIComponent(path)}`);
    }
    app.innerHTML = `<div class="panel empty"><h1>Impossible d’afficher cette page</h1><p class="muted">${esc(err.message)}</p>
      <button class="btn btn-primary" id="retry">Réessayer</button></div>`;
    app.querySelector('#retry').addEventListener('click', render);
  }
  window.scrollTo(0, 0);
}

// ---------- Événements globaux ----------
nav.addEventListener('click', async (e) => {
  if (!e.target.closest('#logout')) return;
  try { await api('/auth/logout', { method: 'POST' }); } catch { /* hors-ligne : on déconnecte localement */ }
  // Vide le cache des données personnelles (téléphone éventuellement partagé)
  if ('caches' in window) caches.delete('finprep-api');
  ctx.user = null;
  toast('Vous êtes déconnecté.');
  ctx.go('/');
});

menuToggle.addEventListener('click', () => {
  const open = nav.classList.toggle('open');
  menuToggle.setAttribute('aria-expanded', String(open));
});

const updateOnline = () => (document.getElementById('offline-banner').hidden = navigator.onLine);
window.addEventListener('online', updateOnline);
window.addEventListener('offline', updateOnline);
window.addEventListener('hashchange', render);

// ---------- Démarrage ----------
(async function init() {
  updateOnline();
  try {
    const [{ user }, config] = await Promise.all([api('/auth/me'), api('/config')]);
    ctx.user = user;
    ctx.config = config;
  } catch {
    /* hors-ligne au démarrage : on continue avec ce qui est en cache */
  }
  render();
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});
})();
