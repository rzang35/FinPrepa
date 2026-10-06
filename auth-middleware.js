/**
 * Authentification : JWT stocké dans un cookie httpOnly (inaccessible au JavaScript du navigateur).
 */
const jwt = require('jsonwebtoken');
const { db } = require('./db');

const COOKIE = 'fp_token';
const SECRET = process.env.JWT_SECRET || 'dev-secret-a-changer';
const isProd = process.env.NODE_ENV === 'production';

if (isProd && !process.env.JWT_SECRET) {
  throw new Error('JWT_SECRET doit être défini en production.');
}

const cookieOptions = { httpOnly: true, sameSite: 'lax', secure: isProd };

function setAuthCookie(res, user) {
  const token = jwt.sign({ id: user.id }, SECRET, { expiresIn: '30d' });
  res.cookie(COOKIE, token, { ...cookieOptions, maxAge: 30 * 24 * 3600 * 1000 });
}

function clearAuthCookie(res) {
  res.clearCookie(COOKIE, cookieOptions);
}

function loadUser(req) {
  const token = req.cookies && req.cookies[COOKIE];
  if (!token) return null;
  try {
    const { id } = jwt.verify(token, SECRET);
    return db.prepare('SELECT id, name, email, role FROM users WHERE id = ?').get(id) || null;
  } catch {
    return null;
  }
}

/** Renseigne req.user si un cookie valide est présent, sans bloquer. */
function optionalAuth(req, _res, next) {
  req.user = loadUser(req);
  next();
}

function requireAuth(req, res, next) {
  req.user = loadUser(req);
  if (!req.user) return res.status(401).json({ error: 'Connectez-vous pour accéder à cette page.' });
  next();
}

function requireAdmin(req, res, next) {
  requireAuth(req, res, () => {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Accès réservé aux administrateurs.' });
    next();
  });
}

module.exports = { setAuthCookie, clearAuthCookie, optionalAuth, requireAuth, requireAdmin };
