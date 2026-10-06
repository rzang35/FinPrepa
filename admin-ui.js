/**
 * Interface administrateur : modules, PDF, questions de QCM et validation des inscriptions.
 */
import { api } from './api.js';
import { esc, fcfa, toast, withBusy } from './ui.js';

const tabs = (current) => `
  <h1>Administration</h1>
  <nav class="tabs" aria-label="Sections d’administration">
    <a href="#/admin" ${current === 'modules' ? 'aria-current="page"' : ''}>Modules</a>
    <a href="#/admin/module/new" ${current === 'new' ? 'aria-current="page"' : ''}>Nouveau module</a>
    <a href="#/admin/enrollments" ${current === 'enrollments' ? 'aria-current="page"' : ''}>Inscriptions</a>
  </nav>`;

/* ---------- Liste des modules ---------- */
export async function adminModules() {
  const { modules } = await api('/admin/modules');
  const rows = modules
    .map(
      (m) => `
      <tr>
        <td><strong>${esc(m.title)}</strong><br><span class="small muted">${esc(m.certification)} ${esc(m.level)}</span></td>
        <td>${fcfa(m.price_xof)}</td>
        <td>${m.has_pdf ? '<span class="tag tag-ok">Oui</span>' : '<span class="tag tag-warn">Manquant</span>'}</td>
        <td>${m.question_count}</td>
        <td>${m.active_count}${m.pending_count ? ` <span class="tag tag-warn">+${m.pending_count} en attente</span>` : ''}</td>
        <td>${m.published ? '<span class="tag tag-ok">Publié</span>' : '<span class="tag tag-muted">Brouillon</span>'}</td>
        <td><a class="btn btn-outline" href="#/admin/module/${m.id}">Modifier</a></td>
      </tr>`
    )
    .join('');

  return {
    html: `${tabs('modules')}
      ${
        modules.length
          ? `<div class="table-wrap"><table>
              <thead><tr><th>Module</th><th>Prix</th><th>PDF</th><th>QCM</th><th>Inscrits</th><th>Statut</th><th></th></tr></thead>
              <tbody>${rows}</tbody></table></div>`
          : '<div class="panel empty"><p>Aucun module pour l’instant.</p><a class="btn btn-primary" href="#/admin/module/new">Créer le premier module</a></div>'
      }`,
  };
}

/* ---------- Création / modification d'un module + gestion des QCM ---------- */
export async function adminModuleEdit(ctx, id) {
  const isNew = !id;
  const m = isNew
    ? { certification: '', level: '', title: '', description: '', price_xof: '', pdf_pages: '', exercises_count: '', published: 1 }
    : (await api(`/admin/modules/${id}`)).module;
  const questions = isNew ? [] : (await api(`/admin/modules/${id}/questions`)).questions;

  const html = `
    ${tabs(isNew ? 'new' : '')}
    <p class="breadcrumb"><a href="#/admin">Modules</a> / ${isNew ? 'Nouveau module' : esc(m.title)}</p>

    <form class="panel" id="module-form" novalidate>
      <h2>${isNew ? 'Nouveau module' : 'Informations du module'}</h2>
      <div id="module-error" role="alert"></div>
      <div class="form-grid">
        <div class="field"><label for="certification">Certification</label>
          <input id="certification" name="certification" type="text" list="cert-list" value="${esc(m.certification)}" placeholder="CFA" required>
          <datalist id="cert-list"><option>CFA</option><option>ACCA</option><option>CAIA</option><option>CIIA</option><option>FRM</option><option>DSCG</option></datalist>
        </div>
        <div class="field"><label for="level">Niveau</label><input id="level" name="level" type="text" value="${esc(m.level)}" placeholder="Level I"></div>
      </div>
      <div class="field"><label for="title">Titre</label><input id="title" name="title" type="text" value="${esc(m.title)}" placeholder="Financial Statement Analysis" required></div>
      <div class="field"><label for="description">Description</label><textarea id="description" name="description" rows="5">${esc(m.description)}</textarea></div>
      <div class="form-grid">
        <div class="field"><label for="price_xof">Prix (FCFA)</label><input id="price_xof" name="price_xof" type="number" min="0" step="500" inputmode="numeric" value="${esc(m.price_xof)}"></div>
        <div class="field"><label for="pdf_pages">Pages de PDF</label><input id="pdf_pages" name="pdf_pages" type="number" min="0" inputmode="numeric" value="${esc(m.pdf_pages)}"></div>
        <div class="field"><label for="exercises_count">Exercices corrigés</label><input id="exercises_count" name="exercises_count" type="number" min="0" inputmode="numeric" value="${esc(m.exercises_count)}"></div>
      </div>
      <div class="field">
        <label for="pdf">${m.has_pdf ? 'Remplacer le PDF' : 'PDF du cours'}</label>
        <input id="pdf" name="pdf" type="file" accept="application/pdf,.pdf">
        <span class="hint">${m.has_pdf ? `Fichier actuel : ${esc(m.pdf_name || 'PDF')}. ` : ''}60 Mo maximum. Compressez vos PDF pour les connexions lentes.</span>
      </div>
      <label class="checkbox" style="margin-bottom:20px"><input type="checkbox" name="published" ${m.published ? 'checked' : ''}> Publié dans le catalogue</label>
      <div class="btn-row">
        <button class="btn btn-primary" type="submit">${isNew ? 'Créer le module' : 'Enregistrer'}</button>
        ${isNew ? '' : '<button class="btn btn-danger" type="button" id="delete-module">Supprimer le module</button>'}
      </div>
    </form>

    ${
      isNew
        ? '<p class="small muted" style="margin-top:16px">Vous pourrez ajouter les questions de QCM une fois le module créé.</p>'
        : `
    <section class="panel">
      <h2>Questions de QCM (${questions.length})</h2>
      <ul class="q-list" id="q-list">
        ${
          questions
            .map(
              (q, n) => `
          <li class="q-item">
            <strong>${n + 1}. ${esc(q.question)}</strong>
            <ol type="A">${q.options.map((o, i) => `<li${i === q.correct_index ? ' class="right"' : ''}>${esc(o)}</li>`).join('')}</ol>
            ${q.explanation ? `<p class="small muted">${esc(q.explanation)}</p>` : ''}
            <div class="btn-row"><button class="btn btn-outline" data-edit="${q.id}">Modifier</button><button class="btn btn-danger" data-del="${q.id}">Supprimer</button></div>
          </li>`
            )
            .join('') || '<li class="muted">Aucune question pour l’instant.</li>'
        }
      </ul>

      <form id="q-form" novalidate>
        <h3 id="q-form-title">Ajouter une question</h3>
        <div id="q-error" role="alert"></div>
        <div class="field"><label for="q-question">Énoncé</label><textarea id="q-question" name="question" rows="3" required></textarea></div>
        <fieldset class="field" style="border:0;padding:0;margin:0 0 16px">
          <legend class="label" style="margin-bottom:6px">Propositions (cochez la bonne réponse, laissez vides celles inutiles)</legend>
          ${[0, 1, 2, 3, 4]
            .map(
              (i) => `<div class="opt-row">
                <input type="radio" name="correct" value="${i}" aria-label="Bonne réponse : proposition ${'ABCDE'[i]}" ${i === 0 ? 'checked' : ''}>
                <input type="text" name="opt${i}" placeholder="Proposition ${'ABCDE'[i]}" aria-label="Proposition ${'ABCDE'[i]}">
              </div>`
            )
            .join('')}
        </fieldset>
        <div class="field"><label for="q-expl">Explication affichée après la réponse</label><textarea id="q-expl" name="explanation" rows="3"></textarea></div>
        <div class="btn-row">
          <button class="btn btn-primary" type="submit" id="q-submit">Ajouter la question</button>
          <button class="btn btn-ghost" type="button" id="q-cancel" hidden>Annuler la modification</button>
        </div>
      </form>
    </section>`
    }`;

  return {
    html,
    mount(root) {
      // ----- Module -----
      const form = root.querySelector('#module-form');
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const fd = new FormData(form);
        fd.set('published', form.published.checked ? 'true' : 'false');
        if (!form.pdf.files.length) fd.delete('pdf');
        try {
          const res = await withBusy(form.querySelector('[type=submit]'), 'Enregistrement…', () =>
            api(isNew ? '/admin/modules' : `/admin/modules/${id}`, { method: isNew ? 'POST' : 'PUT', form: fd })
          );
          toast(isNew ? 'Module créé. Ajoutez maintenant les questions.' : 'Modifications enregistrées.');
          isNew ? ctx.go(`/admin/module/${res.id}`) : ctx.reload();
        } catch (err) {
          root.querySelector('#module-error').innerHTML = `<div class="alert alert-error">${esc(err.message)}</div>`;
        }
      });

      root.querySelector('#delete-module')?.addEventListener('click', async () => {
        if (!confirm(`Supprimer « ${m.title} » ? Les questions, inscriptions et le PDF seront supprimés définitivement.`)) return;
        try {
          await api(`/admin/modules/${id}`, { method: 'DELETE' });
          toast('Module supprimé.');
          ctx.go('/admin');
        } catch (err) {
          toast(err.message, 'error');
        }
      });

      if (isNew) return;

      // ----- Questions -----
      const qForm = root.querySelector('#q-form');
      let editingId = null;

      const resetForm = () => {
        editingId = null;
        qForm.reset();
        root.querySelector('#q-form-title').textContent = 'Ajouter une question';
        root.querySelector('#q-submit').textContent = 'Ajouter la question';
        root.querySelector('#q-cancel').hidden = true;
        root.querySelector('#q-error').innerHTML = '';
      };

      root.querySelector('#q-cancel').addEventListener('click', resetForm);

      qForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        // On ne garde que les propositions remplies et on recalcule l'index de la bonne réponse.
        const checked = Number(qForm.correct.value);
        const filled = [0, 1, 2, 3, 4].map((i) => ({ i, text: qForm[`opt${i}`].value.trim() })).filter((o) => o.text);
        const payload = {
          question: qForm.question.value,
          explanation: qForm.explanation.value,
          options: filled.map((o) => o.text),
          correct_index: filled.findIndex((o) => o.i === checked),
        };
        try {
          await withBusy(root.querySelector('#q-submit'), 'Enregistrement…', () =>
            editingId
              ? api(`/admin/questions/${editingId}`, { method: 'PUT', body: payload })
              : api(`/admin/modules/${id}/questions`, { method: 'POST', body: payload })
          );
          toast(editingId ? 'Question modifiée.' : 'Question ajoutée.');
          ctx.reload();
        } catch (err) {
          root.querySelector('#q-error').innerHTML = `<div class="alert alert-error">${esc(err.message)}</div>`;
        }
      });

      root.querySelector('#q-list').addEventListener('click', async (e) => {
        const editBtn = e.target.closest('[data-edit]');
        const delBtn = e.target.closest('[data-del]');
        if (editBtn) {
          const q = questions.find((x) => x.id === Number(editBtn.dataset.edit));
          resetForm();
          editingId = q.id;
          qForm.question.value = q.question;
          qForm.explanation.value = q.explanation;
          q.options.slice(0, 5).forEach((o, i) => (qForm[`opt${i}`].value = o));
          qForm.correct.value = String(q.correct_index);
          root.querySelector('#q-form-title').textContent = 'Modifier la question';
          root.querySelector('#q-submit').textContent = 'Enregistrer la question';
          root.querySelector('#q-cancel').hidden = false;
          qForm.scrollIntoView({ behavior: 'smooth' });
        }
        if (delBtn) {
          if (!confirm('Supprimer cette question ?')) return;
          try {
            await api(`/admin/questions/${delBtn.dataset.del}`, { method: 'DELETE' });
            toast('Question supprimée.');
            ctx.reload();
          } catch (err) {
            toast(err.message, 'error');
          }
        }
      });
    },
  };
}

/* ---------- Validation des inscriptions (après paiement Mobile Money) ---------- */
export async function adminEnrollments(ctx, params) {
  const status = params.get('status') === 'active' ? 'active' : 'pending';
  const { enrollments } = await api(`/admin/enrollments?status=${status}`);

  const rows = enrollments
    .map(
      (e) => `
      <tr data-user="${e.user_id}" data-module="${e.module_id}">
        <td><strong>${esc(e.name)}</strong><br><span class="small muted">${esc(e.email)}</span></td>
        <td>${esc(e.title)}<br><span class="small muted">${esc(e.certification)} ${esc(e.level)}</span></td>
        <td>${fcfa(e.price_xof)}</td>
        <td>${esc(new Date(e.created_at.replace(' ', 'T') + 'Z').toLocaleDateString('fr-FR'))}</td>
        <td><div class="btn-row">
          ${
            status === 'pending'
              ? '<button class="btn btn-primary" data-action="activate">Valider le paiement</button><button class="btn btn-danger" data-action="delete">Refuser</button>'
              : '<button class="btn btn-danger" data-action="revoke">Suspendre l’accès</button>'
          }
        </div></td>
      </tr>`
    )
    .join('');

  return {
    html: `${tabs('enrollments')}
      <div class="filters" style="margin-bottom:16px" role="group" aria-label="Filtrer les inscriptions">
        <a class="btn ${status === 'pending' ? 'btn-primary' : 'btn-outline'}" href="#/admin/enrollments">En attente de paiement</a>
        <a class="btn ${status === 'active' ? 'btn-primary' : 'btn-outline'}" href="#/admin/enrollments?status=active">Actives</a>
      </div>
      ${
        enrollments.length
          ? `<div class="table-wrap"><table>
              <thead><tr><th>Étudiant</th><th>Module</th><th>Montant</th><th>Date</th><th>Action</th></tr></thead>
              <tbody>${rows}</tbody></table></div>`
          : `<div class="panel empty"><p class="muted">${status === 'pending' ? 'Aucune inscription en attente.' : 'Aucune inscription active.'}</p></div>`
      }`,
    mount(root) {
      root.querySelector('tbody')?.addEventListener('click', async (e) => {
        const btn = e.target.closest('[data-action]');
        if (!btn) return;
        const row = btn.closest('tr');
        const url = `/admin/enrollments/${row.dataset.user}/${row.dataset.module}`;
        try {
          if (btn.dataset.action === 'activate') {
            await api(url, { method: 'POST', body: { status: 'active' } });
            toast('Accès activé pour cet étudiant.');
          } else if (btn.dataset.action === 'revoke') {
            await api(url, { method: 'POST', body: { status: 'pending' } });
            toast('Accès suspendu.');
          } else {
            if (!confirm('Refuser et supprimer cette demande d’inscription ?')) return;
            await api(url, { method: 'DELETE' });
            toast('Demande supprimée.');
          }
          ctx.reload();
        } catch (err) {
          toast(err.message, 'error');
        }
      });
    },
  };
}
