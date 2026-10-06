/**
 * Utilitaires d'interface : échappement HTML, formatage, icônes, notifications.
 */

/** Échappe toute donnée dynamique avant insertion dans le HTML (protection XSS). */
export const esc = (value) =>
  String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

const nf = new Intl.NumberFormat('fr-FR');
export const fcfa = (n) => `${nf.format(Number(n) || 0)} FCFA`;
export const plural = (n, one, many) => `${nf.format(n)} ${n > 1 ? many : one}`;
export const percent = (ratio) => `${Math.round((Number(ratio) || 0) * 100)} %`;

/** Icônes SVG inline (pas de requête réseau supplémentaire). */
const paths = {
  file: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  list: '<path d="M9 6h11M9 12h11M9 18h11"/><circle cx="4.5" cy="6" r="1"/><circle cx="4.5" cy="12" r="1"/><circle cx="4.5" cy="18" r="1"/>',
  pencil: '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M13.5 6.5l4 4"/>',
  download: '<path d="M12 4v11"/><path d="M7 10.5l5 5 5-5"/><path d="M5 20h14"/>',
  wifi: '<path d="M2 8.5a15 15 0 0 1 20 0"/><path d="M5.5 12a10 10 0 0 1 13 0"/><path d="M9 15.5a5 5 0 0 1 6 0"/><circle cx="12" cy="19" r="1"/>',
  phone: '<rect x="6" y="2.5" width="12" height="19" rx="2"/><path d="M11 18h2"/>',
};
export const icon = (name, size = 18) =>
  `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] || ''}</svg>`;

/** Ligne de caractéristiques d'un module (pages, QCM, exercices). */
export function specs(m) {
  const items = [];
  if (m.pdf_pages) items.push(`<li>${icon('file', 16)}${plural(m.pdf_pages, 'page de synthèse', 'pages de synthèse')}</li>`);
  items.push(`<li>${icon('list', 16)}${plural(m.question_count || 0, 'QCM', 'QCM')}</li>`);
  if (m.exercises_count) items.push(`<li>${icon('pencil', 16)}${plural(m.exercises_count, 'exercice corrigé', 'exercices corrigés')}</li>`);
  return `<ul class="specs">${items.join('')}</ul>`;
}

let toastTimer;
export function toast(message, type = 'info') {
  const el = document.getElementById('toast');
  el.textContent = message;
  el.className = `toast show${type === 'error' ? ' error' : ''}`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (el.className = 'toast'), 3200);
}

/** Bloque un bouton pendant une action asynchrone et affiche un libellé d'attente. */
export async function withBusy(button, label, fn) {
  const original = button.innerHTML;
  button.disabled = true;
  button.textContent = label;
  try {
    return await fn();
  } finally {
    button.disabled = false;
    button.innerHTML = original;
  }
}

export const shuffle = (array) => {
  const a = [...array];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};
