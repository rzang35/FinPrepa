/**
 * Routes d'authentification : inscription, connexion, déconnexion, profil courant.
 */
const express = require('express');
const bcrypt = require('bcryptjs');
const { db } = require('./db');
const { setAuthCookie, clearAuthCookie, optionalAuth } = require('./auth-middleware');

const router = express.Router();
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Limiteur très simple en mémoire contre le bourrage d'identifiants (10 essais / 15 min / IP).
// Pour plusieurs instances, remplacez par express-rate-limit + Redis.
const attempts = new Map();
function rateLimit(req, res, next) {
  const now = Date.now();
  const key = req.ip;
  const entry = attempts.get(key) || { count: 0, reset: now + 15 * 60 * 1000 };
  if (now > entry.reset) Object.assign(entry, { count: 0, reset: now + 15 * 60 * 1000 });
  entry.count += 1;
  attempts.set(key, entry);
  if (entry.count > 10) {
    return res.status(429).json({ error: 'Trop de tentatives. Réessayez dans quelques minutes.' });
  }
  next();
}

router.post('/register', rateLimit, (req, res) => {
  const name = String(req.body?.name || '').trim();
  const email = String(req.body?.email || '').trim().toLowerCase();
  const password = String(req.body?.password || '');

  if (name.length < 2) return res.status(400).json({ error: 'Indiquez votre nom complet.' });
  if (!EMAIL_RE.test(email)) return res.status(400).json({ error: 'Adresse email invalide.' });
  if (password.length < 8) return res.status(400).json({ error: 'Le mot de passe doit contenir au moins 8 caractères.' });
  if (db.prepare('SELECT 1 FROM users WHERE email = ?').get(email)) {
    return res.status(409).json({ error: 'Un compte existe déjà avec cet email. Connectez-vous.' });
  }

  const hash = bcrypt.hashSync(password, 10);
  const { lastInsertRowid } = db
    .prepare("INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, 'student')")
    .run(name, email, hash);
  const user = { id: Number(lastInsertRowid), name, email, role: 'student' };
  setAuthCookie(res, user);
  res.status(201).json({ user });
});

router.post('/login', rateLimit, (req, res) => {
  const email = String(req.body?.email || '').trim().toLowerCase();
  const password = String(req.body?.password || '');
  const row = db.prepare('SELECT * FROM users WHERE email = ?').get(email);

  if (!row || !bcrypt.compareSync(password, row.password_hash)) {
    return res.status(401).json({ error: 'Email ou mot de passe incorrect.' });
  }
  attempts.delete(req.ip);
  const user = { id: row.id, name: row.name, email: row.email, role: row.role };
  setAuthCookie(res, user);
  res.json({ user });
});

router.post('/logout', (_req, res) => {
  clearAuthCookie(res);
  res.json({ ok: true });
});

router.get('/me', optionalAuth, (req, res) => {
  res.json({ user: req.user });
});

module.exports = router;
