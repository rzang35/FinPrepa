/**
 * Routes publiques (catalogue) et espace étudiant (inscriptions, PDF, progression, quiz).
 */
const express = require('express');
const path = require('path');
const fs = require('fs');
const { db, UPLOAD_DIR } = require('./db');
const { optionalAuth, requireAuth } = require('./auth-middleware');

const router = express.Router();

const MODULE_FIELDS = `
  m.id, m.certification, m.level, m.title, m.description, m.price_xof,
  m.pdf_pages, m.exercises_count,
  (m.pdf_path IS NOT NULL) AS has_pdf,
  (SELECT COUNT(*) FROM questions q WHERE q.module_id = m.id) AS question_count`;

function moduleId(req) {
  const id = Number.parseInt(req.params.id, 10);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function getEnrollment(userId, modId) {
  return db.prepare('SELECT status, completed FROM enrollments WHERE user_id = ? AND module_id = ?').get(userId, modId);
}

/** Bloque l'accès au contenu si l'inscription n'est pas active (les admins passent). */
function requireActiveEnrollment(req, res, next) {
  const id = moduleId(req);
  if (!id) return res.status(400).json({ error: 'Module invalide.' });
  req.moduleId = id;
  if (req.user.role === 'admin') return next();
  const enr = getEnrollment(req.user.id, id);
  if (!enr || enr.status !== 'active') {
    return res.status(403).json({ error: "Ce contenu est réservé aux étudiants inscrits à ce module." });
  }
  next();
}

// ---------- Configuration publique ----------
router.get('/config', (_req, res) => {
  res.json({
    paymentInstructions: process.env.PAYMENT_INSTRUCTIONS || '',
    autoEnroll: process.env.AUTO_ENROLL === 'true',
  });
});

// ---------- Catalogue ----------
router.get('/modules', optionalAuth, (req, res) => {
  const modules = db
    .prepare(`SELECT ${MODULE_FIELDS} FROM modules m WHERE m.published = 1 ORDER BY m.certification, m.level, m.title`)
    .all();
  if (req.user) {
    const rows = db.prepare('SELECT module_id, status FROM enrollments WHERE user_id = ?').all(req.user.id);
    const map = Object.fromEntries(rows.map((r) => [r.module_id, r.status]));
    modules.forEach((m) => (m.enrollment = map[m.id] || null));
  }
  res.json({ modules });
});

router.get('/modules/:id', optionalAuth, (req, res) => {
  const id = moduleId(req);
  const mod = id && db.prepare(`SELECT ${MODULE_FIELDS} FROM modules m WHERE m.id = ? AND m.published = 1`).get(id);
  if (!mod) return res.status(404).json({ error: "Ce module n'existe pas ou n'est plus proposé." });
  mod.enrollment = req.user ? getEnrollment(req.user.id, id)?.status || null : null;
  res.json({ module: mod });
});

router.post('/modules/:id/enroll', requireAuth, (req, res) => {
  const id = moduleId(req);
  const mod = id && db.prepare('SELECT id FROM modules WHERE id = ? AND published = 1').get(id);
  if (!mod) return res.status(404).json({ error: "Ce module n'existe pas." });

  const status = process.env.AUTO_ENROLL === 'true' ? 'active' : 'pending';
  db.prepare('INSERT OR IGNORE INTO enrollments (user_id, module_id, status) VALUES (?, ?, ?)').run(req.user.id, id, status);
  res.status(201).json({ enrollment: getEnrollment(req.user.id, id).status });
});

// ---------- Tableau de bord étudiant ----------
router.get('/me/modules', requireAuth, (req, res) => {
  const modules = db
    .prepare(
      `SELECT ${MODULE_FIELDS}, e.status, e.completed, e.completed_at,
        (SELECT MAX(CAST(a.score AS REAL) / a.total) FROM quiz_attempts a
          WHERE a.user_id = e.user_id AND a.module_id = m.id AND a.total > 0) AS best_score,
        (SELECT COUNT(*) FROM quiz_attempts a WHERE a.user_id = e.user_id AND a.module_id = m.id) AS attempts
       FROM enrollments e JOIN modules m ON m.id = e.module_id
       WHERE e.user_id = ?
       ORDER BY e.status = 'active' DESC, e.created_at DESC`
    )
    .all(req.user.id);
  res.json({ modules });
});

// ---------- Contenu réservé aux inscrits ----------
router.get('/modules/:id/pdf', requireAuth, requireActiveEnrollment, (req, res) => {
  const mod = db.prepare('SELECT title, pdf_path, pdf_name FROM modules WHERE id = ?').get(req.moduleId);
  if (!mod || !mod.pdf_path) return res.status(404).json({ error: "Le PDF de ce module n'est pas encore disponible." });

  const file = path.join(UPLOAD_DIR, path.basename(mod.pdf_path));
  if (!fs.existsSync(file)) return res.status(404).json({ error: 'Fichier introuvable sur le serveur.' });
  const downloadName = (mod.pdf_name || mod.title).replace(/[^\w\s.-]/g, '').trim() || 'module';
  res.download(file, downloadName.endsWith('.pdf') ? downloadName : `${downloadName}.pdf`);
});

router.post('/modules/:id/progress', requireAuth, requireActiveEnrollment, (req, res) => {
  const completed = req.body?.completed ? 1 : 0;
  db.prepare(
    `UPDATE enrollments SET completed = ?, completed_at = CASE WHEN ? = 1 THEN datetime('now') ELSE NULL END
     WHERE user_id = ? AND module_id = ?`
  ).run(completed, completed, req.user.id, req.moduleId);
  res.json({ completed: Boolean(completed) });
});

/**
 * Les réponses sont envoyées avec les questions : cela permet la correction immédiate
 * et l'entraînement HORS-LIGNE (le service worker met la réponse en cache).
 * Seuls les étudiants inscrits (donc ayant payé) y ont accès.
 */
router.get('/modules/:id/questions', requireAuth, requireActiveEnrollment, (req, res) => {
  const mod = db.prepare('SELECT id, certification, level, title FROM modules WHERE id = ?').get(req.moduleId);
  if (!mod) return res.status(404).json({ error: "Ce module n'existe pas." });
  const questions = db
    .prepare('SELECT id, question, options, correct_index, explanation FROM questions WHERE module_id = ? ORDER BY id')
    .all(req.moduleId)
    .map((q) => ({ ...q, options: JSON.parse(q.options) }));
  res.json({ module: mod, questions });
});

router.post('/modules/:id/attempts', requireAuth, requireActiveEnrollment, (req, res) => {
  const score = Number.parseInt(req.body?.score, 10);
  const total = Number.parseInt(req.body?.total, 10);
  if (!Number.isInteger(score) || !Number.isInteger(total) || total <= 0 || score < 0 || score > total) {
    return res.status(400).json({ error: 'Résultat de quiz invalide.' });
  }
  db.prepare('INSERT INTO quiz_attempts (user_id, module_id, score, total) VALUES (?, ?, ?, ?)').run(
    req.user.id, req.moduleId, score, total
  );
  res.status(201).json({ ok: true });
});

module.exports = router;
