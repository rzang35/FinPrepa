/**
 * Vues publiques (accueil, catalogue, fiche module, connexion) et espace étudiant (tableau de bord, quiz).
 * Chaque vue renvoie { html, mount(root) } : le HTML est injecté puis mount() branche les événements.
 */
import { api } from './api.js';
import { esc, fcfa, icon, specs, toast, withBusy, percent, plural, shuffle } from './ui.js';

const KEYS = 'ABCDEF';

/* ==========================================================================
   Accueil + catalogue
   ========================================================================== */

// Question d'essai affichée en page d'accueil : l'étudiant teste le format avant de s'inscrire.
const SAMPLE = {
  label: 'CFA Level I · Financial Statement Analysis',
  question: 'Marge nette de 5 %, rotation de l’actif de 2 et levier financier de 1,5. Quel est le ROE ?',
  options: ['10 %', '15 %', '7,5 %', '3,3 %'],
  correct: 1,
  explanation: 'Décomposition DuPont : ROE = marge nette × rotation de l’actif × levier = 5 % × 2 × 1,5 = 15 %.',
};

function catalogueList(modules) {
  if (!modules.length) return '<div class="panel empty"><p class="muted">Aucun module dans cette catégorie pour le moment.</p></div>';
  return `<ul class="catalogue">${modules
    .map(
      (m) => `
      <li class="course">
        <div class="course-cert">${esc(m.certification)}<span class="course-level">${esc(m.level)}</span></div>
        <div>
          <h3><a href="#/module/${m.id}">${esc(m.title)}</a></h3>
          <p class="course-desc">${esc(m.description)}</p>
          ${specs(m)}
        </div>
        <div class="course-side">
          <span class="price">${fcfa(m.price_xof)}</span>
          ${
            m.enrollment === 'active'
              ? '<span class="tag tag-ok">Inscrit</span>'
              : m.enrollment === 'pending'
              ? '<span class="tag tag-warn">En attente</span>'
              : `<a class="btn btn-outline" href="#/module/${m.id}">Voir le module</a>`
          }
        </div>
      </li>`
    )
    .join('')}</ul>`;
}

export async function viewHome(ctx) {
  const { modules } = await api('/modules');
  const certs = [...new Set(modules.map((m) => m.certification))];

  const html = `
    <section class="hero">
      <div>
        <h1>Préparez le CFA, l’ACCA, le CAIA et le CIIA, même sans connexion stable.</h1>
        <p class="hero-lead">Des fiches PDF de synthèse à télécharger, des QCM corrigés instantanément et des exercices pas à pas. Rien de lourd à charger : tout fonctionne sur un téléphone.</p>
        <ul class="hero-points">
          <li>${icon('download')}<span>Les cours se téléchargent une fois et se lisent hors-ligne.</span></li>
          <li>${icon('check')}<span>Chaque réponse de QCM est expliquée, juste ou fausse.</span></li>
          <li>${icon('phone')}<span>Paiement en Francs CFA, par Mobile Money.</span></li>
        </ul>
        <div class="btn-row">
          <a class="btn btn-primary" href="#catalogue" data-scroll>Voir les modules</a>
          ${ctx.user ? '<a class="btn btn-outline" href="#/dashboard">Mon espace</a>' : '<a class="btn btn-outline" href="#/register">Créer un compte</a>'}
        </div>
      </div>

      <div class="sample" id="sample" aria-labelledby="sample-q">
        <div class="sample-meta"><span>${esc(SAMPLE.label)}</span><span>Question d’essai</span></div>
        <h2 id="sample-q">${esc(SAMPLE.question)}</h2>
        <div class="options">
          ${SAMPLE.options.map((o, i) => `<button class="option" data-i="${i}"><span class="option-key">${KEYS[i]}</span><span>${esc(o)}</span></button>`).join('')}
        </div>
        <div id="sample-feedback" aria-live="polite"></div>
      </div>
    </section>

    <section class="section" id="catalogue" aria-labelledby="catalogue-title">
      <div class="section-head">
        <h2 id="catalogue-title">Modules disponibles</h2>
        ${
          certs.length > 1
            ? `<div class="filters" role="group" aria-label="Filtrer par certification">
                <button aria-pressed="true" data-cert="">Toutes</button>
                ${certs.map((c) => `<button aria-pressed="false" data-cert="${esc(c)}">${esc(c)}</button>`).join('')}
              </div>`
            : ''
        }
      </div>
      <div id="catalogue-list">${catalogueList(modules)}</div>
    </section>`;

  return {
    html,
    mount(root) {
      // Question d'essai
      const sample = root.querySelector('#sample');
      sample.addEventListener('click', (e) => {
        const btn = e.target.closest('.option');
        if (!btn) return;
        const chosen = Number(btn.dataset.i);
        sample.querySelectorAll('.option').forEach((b, i) => {
          b.disabled = true;
          if (i === SAMPLE.correct) b.classList.add('is-correct');
          else if (i === chosen) b.classList.add('is-wrong');
        });
        const ok = chosen === SAMPLE.correct;
        sample.querySelector('#sample-feedback').innerHTML = `
          <div class="feedback ${ok ? 'ok' : 'ko'}"><strong>${ok ? 'Bonne réponse.' : `Réponse attendue : ${KEYS[SAMPLE.correct]}.`}</strong>${esc(SAMPLE.explanation)}</div>
          <p class="small muted">Chaque module contient une banque de questions de ce type.</p>`;
      });

      // Défilement vers le catalogue sans casser le routeur à base de hash
      root.querySelector('[data-scroll]').addEventListener('click', (e) => {
        e.preventDefault();
        root.querySelector('#catalogue').scrollIntoView({ behavior: 'smooth' });
      });

      // Filtres par certification
      root.querySelector('.filters')?.addEventListener('click', (e) => {
        const btn = e.target.closest('button');
        if (!btn) return;
        root.querySelectorAll('.filters button').forEach((b) => b.setAttribute('aria-pressed', String(b === btn)));
        const cert = btn.dataset.cert;
        root.querySelector('#catalogue-list').innerHTML = catalogueList(cert ? modules.filter((m) => m.certification === cert) : modules);
      });
    },
  };
}

/* ==========================================================================
   Fiche module
   ========================================================================== */
export async function viewModule(ctx, id) {
  const { module: m } = await api(`/modules/${id}`);

  let action;
  if (!ctx.user) {
    action = `<a class="btn btn-primary btn-block" href="#/register?next=/module/${m.id}">Créer un compte pour s’inscrire</a>
              <p class="small muted" style="margin-top:10px">Déjà inscrit ? <a href="#/login?next=/module/${m.id}">Se connecter</a></p>`;
  } else if (m.enrollment === 'active') {
    action = `<a class="btn btn-primary btn-block" href="#/dashboard">Accéder au module</a>`;
  } else if (m.enrollment === 'pending') {
    action = `<div class="alert alert-warn"><strong>Inscription en attente de paiement.</strong><br>${esc(ctx.config.paymentInstructions)}</div>`;
  } else {
    action = `<button class="btn btn-primary btn-block" id="enroll">S’inscrire à ce module</button>
              ${ctx.config.autoEnroll ? '' : '<p class="small muted" style="margin-top:10px">Les instructions de paiement Mobile Money s’affichent après l’inscription.</p>'}`;
  }

  const html = `
    <p class="breadcrumb"><a href="#/">Catalogue</a> / ${esc(m.certification)} ${esc(m.level)}</p>
    <div class="detail">
      <article class="panel">
        <span class="tag">${esc(m.certification)} ${esc(m.level)}</span>
        <h1 style="margin-top:12px">${esc(m.title)}</h1>
        <p class="detail-body">${esc(m.description)}</p>
      </article>
      <aside class="panel buybox" aria-label="Inscription">
        <span class="price">${fcfa(m.price_xof)}</span>
        <ul class="includes">
          ${m.pdf_pages ? `<li>${icon('file')}${plural(m.pdf_pages, 'page', 'pages')} de synthèse en PDF</li>` : ''}
          <li>${icon('list')}${plural(m.question_count, 'question', 'questions')} de QCM corrigées</li>
          ${m.exercises_count ? `<li>${icon('pencil')}${plural(m.exercises_count, 'exercice corrigé', 'exercices corrigés')}</li>` : ''}
          <li>${icon('wifi')}Utilisable hors-ligne après téléchargement</li>
        </ul>
        <div id="enroll-zone">${action}</div>
      </aside>
    </div>`;

  return {
    html,
    mount(root) {
      root.querySelector('#enroll')?.addEventListener('click', async (e) => {
        try {
          const { enrollment } = await withBusy(e.currentTarget, 'Inscription…', () => api(`/modules/${m.id}/enroll`, { method: 'POST' }));
          if (enrollment === 'active') {
            toast('Inscription confirmée. Le module est dans votre espace.');
            ctx.go('/dashboard');
          } else {
            root.querySelector('#enroll-zone').innerHTML = `<div class="alert alert-warn"><strong>Inscription enregistrée.</strong><br>${esc(ctx.config.paymentInstructions)}</div>`;
          }
        } catch (err) {
          toast(err.message, 'error');
        }
      });
    },
  };
}

/* ==========================================================================
   Connexion / inscription
   ========================================================================== */
function authView(ctx, mode, params) {
  const isLogin = mode === 'login';
  const next = params.get('next');
  const html = `
    <div class="auth panel">
      <h1>${isLogin ? 'Se connecter' : 'Créer un compte'}</h1>
      <p class="muted">${isLogin ? 'Retrouvez vos modules et votre progression.' : 'Gratuit. Vous choisirez vos modules ensuite.'}</p>
      <div id="form-error" role="alert"></div>
      <form id="auth-form" novalidate>
        ${isLogin ? '' : `<div class="field"><label for="name">Nom complet</label><input id="name" name="name" type="text" autocomplete="name" required></div>`}
        <div class="field"><label for="email">Email</label><input id="email" name="email" type="email" autocomplete="email" inputmode="email" required></div>
        <div class="field">
          <label for="password">Mot de passe</label>
          <input id="password" name="password" type="password" autocomplete="${isLogin ? 'current-password' : 'new-password'}" minlength="8" required>
          ${isLogin ? '' : '<span class="hint">8 caractères minimum.</span>'}
        </div>
        <button class="btn btn-primary btn-block" type="submit">${isLogin ? 'Se connecter' : 'Créer mon compte'}</button>
      </form>
      <p class="small muted" style="margin-top:16px;text-align:center">
        ${isLogin ? `Pas encore de compte ? <a href="#/register${next ? `?next=${encodeURIComponent(next)}` : ''}">Créer un compte</a>` : `Déjà un compte ? <a href="#/login${next ? `?next=${encodeURIComponent(next)}` : ''}">Se connecter</a>`}
      </p>
    </div>`;

  return {
    html,
    mount(root) {
      const form = root.querySelector('#auth-form');
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const data = Object.fromEntries(new FormData(form));
        try {
          const { user } = await withBusy(form.querySelector('button'), 'Un instant…', () =>
            api(`/auth/${isLogin ? 'login' : 'register'}`, { method: 'POST', body: data })
          );
          ctx.setUser(user);
          toast(isLogin ? `Bonjour ${user.name.split(' ')[0]}.` : 'Compte créé.');
          const safeNext = next && next.startsWith('/') ? next : null;
          ctx.go(safeNext || (user.role === 'admin' ? '/admin' : '/dashboard'));
        } catch (err) {
          root.querySelector('#form-error').innerHTML = `<div class="alert alert-error">${esc(err.message)}</div>`;
        }
      });
    },
  };
}
export const viewLogin = (ctx, params) => authView(ctx, 'login', params);
export const viewRegister = (ctx, params) => authView(ctx, 'register', params);

/* ==========================================================================
   Tableau de bord étudiant
   ========================================================================== */
function moduleCard(m) {
  if (m.status !== 'active') {
    return `
      <article class="my-module">
        <div class="my-module-head">
          <div><span class="tag">${esc(m.certification)} ${esc(m.level)}</span><h3>${esc(m.title)}</h3></div>
          <span class="tag tag-warn">En attente de paiement</span>
        </div>
        <p class="small muted" style="margin:0">Votre accès sera ouvert dès réception du paiement de ${fcfa(m.price_xof)}.</p>
      </article>`;
  }
  const score = m.best_score == null ? 'Pas encore de quiz' : `Meilleur score : ${percent(m.best_score)}`;
  return `
    <article class="my-module${m.completed ? ' is-done' : ''}" data-id="${m.id}">
      <div class="my-module-head">
        <div><span class="tag">${esc(m.certification)} ${esc(m.level)}</span><h3>${esc(m.title)}</h3></div>
        <span class="tag ${m.completed ? 'tag-ok' : 'tag-muted'}" data-status>${m.completed ? 'Module complété' : 'En cours'}</span>
      </div>
      <p class="small muted">${specsText(m)} · ${score}</p>
      <div class="my-module-actions">
        <div class="btn-row">
          ${
            m.has_pdf
              ? `<a class="btn btn-outline" href="/api/modules/${m.id}/pdf" download>${icon('download')}Télécharger le PDF</a>`
              : '<span class="btn btn-outline" aria-disabled="true">PDF bientôt disponible</span>'
          }
          ${
            m.question_count
              ? `<a class="btn btn-primary" href="#/quiz/${m.id}">S’entraîner</a>`
              : '<span class="btn btn-primary" aria-disabled="true">QCM bientôt disponibles</span>'
          }
        </div>
        <label class="checkbox"><input type="checkbox" data-complete ${m.completed ? 'checked' : ''}> J’ai terminé ce module</label>
      </div>
    </article>`;
}
const specsText = (m) =>
  [m.pdf_pages && plural(m.pdf_pages, 'page', 'pages'), plural(m.question_count, 'QCM', 'QCM'), m.exercises_count && plural(m.exercises_count, 'exercice', 'exercices')]
    .filter(Boolean)
    .join(' · ');

export async function viewDashboard(ctx) {
  const { modules } = await api('/me/modules');
  const active = modules.filter((m) => m.status === 'active');
  const done = active.filter((m) => m.completed).length;
  const scored = active.filter((m) => m.best_score != null);
  const avg = scored.length ? scored.reduce((s, m) => s + m.best_score, 0) / scored.length : null;

  const html = `
    <h1>Bonjour ${esc(ctx.user.name.split(' ')[0])}</h1>
    ${
      modules.length
        ? `
      <div class="overview" aria-label="Votre progression">
        <div><strong>${active.length}</strong><span>${active.length > 1 ? 'modules actifs' : 'module actif'}</span></div>
        <div><strong id="done-count">${done}</strong><span>${done > 1 ? 'modules complétés' : 'module complété'}</span></div>
        <div><strong>${avg == null ? '–' : percent(avg)}</strong><span>score moyen aux quiz</span></div>
      </div>
      ${active.length ? `<div class="progress" style="margin:-16px 0 32px" role="progressbar" aria-label="Modules complétés" aria-valuemin="0" aria-valuemax="${active.length}" aria-valuenow="${done}"><span id="done-bar" style="width:${(done / active.length) * 100}%"></span></div>` : ''}
      <div class="section-head"><h2>Mes modules</h2><a class="btn btn-ghost" href="#/">Ajouter un module</a></div>
      <div class="my-modules">${modules.map(moduleCard).join('')}</div>
      <p class="small muted" style="margin-top:20px">Astuce : téléchargez vos PDF quand vous avez du réseau, ils restent lisibles hors-ligne sur votre téléphone. Les quiz déjà ouverts fonctionnent aussi sans connexion.</p>`
        : `
      <div class="panel empty">
        <h2>Vous n’êtes inscrit à aucun module</h2>
        <p class="muted">Choisissez un premier module dans le catalogue pour commencer.</p>
        <a class="btn btn-primary" href="#/">Voir le catalogue</a>
      </div>`
    }`;

  return {
    html,
    mount(root) {
      root.addEventListener('change', async (e) => {
        const box = e.target.closest('[data-complete]');
        if (!box) return;
        const card = box.closest('.my-module');
        const completed = box.checked;
        try {
          await api(`/modules/${card.dataset.id}/progress`, { method: 'POST', body: { completed } });
          card.classList.toggle('is-done', completed);
          const tag = card.querySelector('[data-status]');
          tag.textContent = completed ? 'Module complété' : 'En cours';
          tag.className = `tag ${completed ? 'tag-ok' : 'tag-muted'}`;
          const n = root.querySelectorAll('[data-complete]:checked').length;
          root.querySelector('#done-count').textContent = n;
          root.querySelector('#done-bar').style.width = `${(n / active.length) * 100}%`;
          toast(completed ? 'Module marqué comme complété.' : 'Module remis en cours.');
        } catch (err) {
          box.checked = !completed;
          toast(err.message, 'error');
        }
      });
    },
  };
}

/* ==========================================================================
   Quiz interactif avec correction immédiate
   ========================================================================== */
export async function viewQuiz(_ctx, id) {
  const { module: m, questions: all } = await api(`/modules/${id}/questions`);
  if (!all.length) {
    return { html: `<div class="panel empty"><h2>Aucune question pour ce module</h2><a class="btn btn-primary" href="#/dashboard">Retour à mon espace</a></div>` };
  }

  return {
    html: `<div class="quiz" id="quiz"></div>`,
    mount(root) {
      const box = root.querySelector('#quiz');
      let questions, index, score, missed;

      const start = () => {
        questions = shuffle(all);
        index = 0;
        score = 0;
        missed = [];
        showQuestion();
      };

      const showQuestion = () => {
        const q = questions[index];
        box.innerHTML = `
          <div class="quiz-top"><a href="#/dashboard">Quitter</a><span>Question ${index + 1} sur ${questions.length}</span></div>
          <div class="progress" role="progressbar" aria-valuemin="0" aria-valuemax="${questions.length}" aria-valuenow="${index}"><span style="width:${(index / questions.length) * 100}%"></span></div>
          <p class="small muted">${esc(m.certification)} ${esc(m.level)} · ${esc(m.title)}</p>
          <h1 class="question" tabindex="-1">${esc(q.question)}</h1>
          <div class="options">
            ${q.options.map((o, i) => `<button class="option" data-i="${i}"><span class="option-key">${KEYS[i]}</span><span>${esc(o)}</span></button>`).join('')}
          </div>
          <div id="feedback" aria-live="polite"></div>`;
        box.querySelector('.question').focus();
      };

      const answer = (chosen) => {
        const q = questions[index];
        const ok = chosen === q.correct_index;
        if (ok) score++;
        else missed.push({ q, chosen });
        box.querySelectorAll('.option').forEach((b, i) => {
          b.disabled = true;
          if (i === q.correct_index) b.classList.add('is-correct');
          else if (i === chosen) b.classList.add('is-wrong');
        });
        const last = index === questions.length - 1;
        box.querySelector('#feedback').innerHTML = `
          <div class="feedback ${ok ? 'ok' : 'ko'}">
            <strong>${ok ? 'Bonne réponse.' : `Réponse attendue : ${KEYS[q.correct_index]}.`}</strong>${esc(q.explanation)}
          </div>
          <button class="btn btn-primary" data-next>${last ? 'Voir mon résultat' : 'Question suivante'}</button>`;
        box.querySelector('[data-next]').focus();
      };

      const finish = async () => {
        const ratio = score / questions.length;
        const message = ratio >= 0.7 ? 'Très bon niveau. Continuez à vous entraîner pour consolider.' : ratio >= 0.5 ? 'Les bases sont là. Relisez les points ci-dessous dans votre PDF.' : 'Reprenez la fiche PDF du module avant un nouvel essai.';
        box.innerHTML = `
          <div class="panel">
            <p class="small muted">${esc(m.certification)} ${esc(m.level)} · ${esc(m.title)}</p>
            <h1 tabindex="-1">Résultat</h1>
            <p class="score">${score} / ${questions.length}</p>
            <p>${message}</p>
            <p class="small muted" id="save-status">Enregistrement du résultat…</p>
            ${
              missed.length
                ? `<h2 style="margin-top:24px">À revoir</h2>
                   <ul class="review">${missed
                     .map(({ q, chosen }) => `<li><strong>${esc(q.question)}</strong><br>
                       <span class="small">Votre réponse : ${esc(q.options[chosen])}<br>Bonne réponse : ${esc(q.options[q.correct_index])}</span>
                       <p class="small muted" style="margin:6px 0 0">${esc(q.explanation)}</p></li>`)
                     .join('')}</ul>`
                : ''
            }
            <div class="btn-row"><button class="btn btn-primary" data-restart>Recommencer</button><a class="btn btn-outline" href="#/dashboard">Retour à mon espace</a></div>
          </div>`;
        box.querySelector('h1').focus();
        try {
          await api(`/modules/${id}/attempts`, { method: 'POST', body: { score, total: questions.length } });
          box.querySelector('#save-status').textContent = 'Résultat enregistré dans votre espace.';
        } catch {
          box.querySelector('#save-status').textContent = 'Hors-ligne : ce résultat n’a pas pu être enregistré.';
        }
      };

      box.addEventListener('click', (e) => {
        const option = e.target.closest('.option');
        if (option && !option.disabled) return answer(Number(option.dataset.i));
        if (e.target.closest('[data-next]')) {
          index++;
          return index < questions.length ? showQuestion() : finish();
        }
        if (e.target.closest('[data-restart]')) start();
      });

      start();
    },
  };
}
