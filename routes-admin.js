/**
 * Interface administrateur : modules (avec upload PDF), questions de QCM, validation des inscriptions.
 * Toutes les routes exigent un compte admin (vérifié AVANT tout upload).
 */
const express = require('express');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const multer = require('multer');
const { db, UPLOAD_DIR } = require('./db');
const { requireAdmin } = require('./auth-middleware');

const router = express.Router();
router.use(requireAdmin);

// ---------- Upload PDF ----------
const httpError = (status, message) => Object.assign(new Error(message), { status });

const upload = multer({
  storage: multer.diskStorage({
    destination: UPLOAD_DIR,
    filename: (_req, _file, cb) => cb(null, `${Date.now()}-${crypto.randomBytes(6).toString('hex')}.pdf`),
  }),
  limits: { fileSize: 60 * 1024 * 1024 }, // 60 Mo
  fileFilter: (_req, file, cb) => {
    const ok = file.mimetype === 'application/pdf' || file.originalname.toLowerCase().endsWith('.pdf');
    cb(ok ? null : httpError(400, 'Seuls les fichiers PDF sont acceptés.'), ok);
  },
});

/** Vérifie la signature "%PDF-" du fichier reçu, le supprime sinon. */
function assertRealPdf(file) {
  if (!file) return;
  const fd = fs.openSync(file.path, 'r');
  const buf = Buffer.alloc(5);
  fs.readSync(fd, buf, 0, 5, 0);
  fs.closeSync(fd);
  if (buf.toString() !== '%PDF-') {
    fs.rmSync(file.path, { force: true });
    throw httpError(400, "Le fichier envoyé n'est pas un PDF valide.");
  }
}

function removeUpload(filename) {
  if (filename) fs.rmSync(path.join(UPLOAD_DIR, path.basename(filename)), { force: true });
}

function parseModule(body) {
  const m = {
    certification: String(body.certification || '').trim(),
    level: String(body.level || '').trim(),
    title: String(body.title || '').trim(),
    description: String(body.description || '').trim(),
    price_xof: Math.max(0, Number.parseInt(body.price_xof, 10) || 0),
    pdf_pages: Math.max(0, Number.parseInt(body.pdf_pages, 10) || 0),
    exercises_count: Math.max(0, Number.parseInt(body.exercises_count, 10) || 0),
    published: body.published === 'true' || body.published === '1' || body.published === true ? 1 : 0,
  };
  if (!m.certification) throw httpError(400, 'Indiquez la certification (ex : CFA).');
  if (!m.title) throw httpError(400, 'Indiquez le titre du module.');
  return m;
}

function idParam(req) {
  const id = Number.parseInt(req.params.id, 10);
  if (!Number.isInteger(id) || id <= 0) throw httpError(400, 'Identifiant invalide.');
  return id;
}

// ---------- Modules ----------
router.get('/modules', (_req, res) => {
  const modules = db
    .prepare(
      `SELECT m.*, (m.pdf_path IS NOT NULL) AS has_pdf,
        (SELECT COUNT(*) FROM questions q WHERE q.module_id = m.id) AS question_count,
        (SELECT COUNT(*) FROM enrollments e WHERE e.module_id = m.id AND e.status = 'active') AS active_count,
        (SELECT COUNT(*) FROM enrollments e WHERE e.module_id = m.id AND e.status = 'pending') AS pending_count
       FROM modules m ORDER BY m.certification, m.level, m.title`
    )
    .all();
  res.json({ modules });
});

router.get('/modules/:id', (req, res) => {
  const mod = db.prepare('SELECT *, (pdf_path IS NOT NULL) AS has_pdf FROM modules WHERE id = ?').get(idParam(req));
  if (!mod) throw httpError(404, 'Module introuvable.');
  res.json({ module: mod });
});

router.post('/modules', upload.single('pdf'), (req, res) => {
  try {
    assertRealPdf(req.file);
    const m = parseModule(req.body);
    const { lastInsertRowid } = db
      .prepare(
        `INSERT INTO modules (certification, level, title, description, price_xof, pdf_pages, exercises_count, published, pdf_path, pdf_name)
         VALUES (@certification, @level, @title, @description, @price_xof, @pdf_pages, @exercises_count, @published, @pdf_path, @pdf_name)`
      )
      .run({ ...m, pdf_path: req.file?.filename || null, pdf_name: req.file?.originalname || null });
    res.status(201).json({ id: Number(lastInsertRowid) });
  } catch (err) {
    removeUpload(req.file?.filename);
    throw err;
  }
});

router.put('/modules/:id', upload.single('pdf'), (req, res) => {
  try {
    const id = idParam(req);
    const existing = db.prepare('SELECT pdf_path FROM modules WHERE id = ?').get(id);
    if (!existing) throw httpError(404, 'Module introuvable.');
    assertRealPdf(req.file);
    const m = parseModule(req.body);

    db.prepare(
      `UPDATE modules SET certification=@certification, level=@level, title=@title, description=@description,
        price_xof=@price_xof, pdf_pages=@pdf_pages, exercises_count=@exercises_count, published=@published,
        updated_at=datetime('now') WHERE id=@id`
    ).run({ ...m, id });

    if (req.file) {
      db.prepare('UPDATE modules SET pdf_path = ?, pdf_name = ? WHERE id = ?').run(req.file.filename, req.file.originalname, id);
      removeUpload(existing.pdf_path); // on remplace l'ancien fichier
    }
    res.json({ id });
  } catch (err) {
    removeUpload(req.file?.filename);
    throw err;
  }
});

router.delete('/modules/:id', (req, res) => {
  const id = idParam(req);
  const mod = db.prepare('SELECT pdf_path FROM modules WHERE id = ?').get(id);
  if (!mod) throw httpError(404, 'Module introuvable.');
  db.prepare('DELETE FROM modules WHERE id = ?').run(id); // questions & inscriptions supprimées en cascade
  removeUpload(mod.pdf_path);
  res.json({ ok: true });
});

// ---------- Questions de QCM ----------
function parseQuestion(body) {
  const question = String(body?.question || '').trim();
  const options = (Array.isArray(body?.options) ? body.options : []).map((o) => String(o).trim()).filter(Boolean);
  const correct_index = Number.parseInt(body?.correct_index, 10);
  const explanation = String(body?.explanation || '').trim();
  if (!question) throw httpError(400, "Rédigez l'énoncé de la question.");
  if (options.length < 2 || options.length > 6) throw httpError(400, 'Proposez entre 2 et 6 réponses.');
  if (!Number.isInteger(correct_index) || correct_index < 0 || correct_index >= options.length) {
    throw httpError(400, 'Sélectionnez la bonne réponse parmi les propositions remplies.');
  }
  return { question, options: JSON.stringify(options), correct_index, explanation };
}

router.get('/modules/:id/questions', (req, res) => {
  const questions = db
    .prepare('SELECT * FROM questions WHERE module_id = ? ORDER BY id')
    .all(idParam(req))
    .map((q) => ({ ...q, options: JSON.parse(q.options) }));
  res.json({ questions });
});

router.post('/modules/:id/questions', (req, res) => {
  const moduleId = idParam(req);
  if (!db.prepare('SELECT 1 FROM modules WHERE id = ?').get(moduleId)) throw httpError(404, 'Module introuvable.');
  const q = parseQuestion(req.body);
  const { lastInsertRowid } = db
    .prepare('INSERT INTO questions (module_id, question, options, correct_index, explanation) VALUES (?, ?, ?, ?, ?)')
    .run(moduleId, q.question, q.options, q.correct_index, q.explanation);
  res.status(201).json({ id: Number(lastInsertRowid) });
});

router.put('/questions/:id', (req, res) => {
  const q = parseQuestion(req.body);
  const info = db
    .prepare('UPDATE questions SET question = ?, options = ?, correct_index = ?, explanation = ? WHERE id = ?')
    .run(q.question, q.options, q.correct_index, q.explanation, idParam(req));
  if (!info.changes) throw httpError(404, 'Question introuvable.');
  res.json({ ok: true });
});

router.delete('/questions/:id', (req, res) => {
  db.prepare('DELETE FROM questions WHERE id = ?').run(idParam(req));
  res.json({ ok: true });
});

// ---------- Inscriptions (validation après paiement) ----------
router.get('/enrollments', (req, res) => {
  const status = req.query.status === 'active' ? 'active' : 'pending';
  const rows = db
    .prepare(
      `SELECT e.user_id, e.module_id, e.status, e.completed, e.created_at,
        u.name, u.email, m.title, m.certification, m.level, m.price_xof
       FROM enrollments e JOIN users u ON u.id = e.user_id JOIN modules m ON m.id = e.module_id
       WHERE e.status = ? ORDER BY e.created_at DESC`
    )
    .all(status);
  res.json({ enrollments: rows });
});

router.post('/enrollments/:userId/:moduleId', (req, res) => {
  const status = req.body?.status === 'active' ? 'active' : 'pending';
  const info = db
    .prepare('UPDATE enrollments SET status = ? WHERE user_id = ? AND module_id = ?')
    .run(status, Number(req.params.userId), Number(req.params.moduleId));
  if (!info.changes) throw httpError(404, 'Inscription introuvable.');
  res.json({ status });
});

router.delete('/enrollments/:userId/:moduleId', (req, res) => {
  db.prepare('DELETE FROM enrollments WHERE user_id = ? AND module_id = ?').run(
    Number(req.params.userId), Number(req.params.moduleId)
  );
  res.json({ ok: true });
});

module.exports = router;
