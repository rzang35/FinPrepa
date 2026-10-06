/**
 * FinPrep — serveur Express.
 * Sert l'API REST (/api/...) et les fichiers du site.
 */
require('dotenv').config();
const path = require('path');
const express = require('express');
const helmet = require('helmet');
const compression = require('compression');
const cookieParser = require('cookie-parser');
const { seed } = require('./seed');

seed();

const app = express();
app.set('trust proxy', 1); // derrière le proxy HTTPS de Render / Railway / Nginx

app.use(
  helmet({
    contentSecurityPolicy: {
      directives: { ...helmet.contentSecurityPolicy.getDefaultDirectives(), 'img-src': ["'self'", 'data:'] },
    },
  })
);
app.use(compression()); // gzip : pages et JSON plus légers sur connexion lente
app.use(express.json({ limit: '1mb' }));
app.use(cookieParser());

// ---------- API ----------
app.use('/api/auth', require('./routes-auth'));
app.use('/api/admin', require('./routes-admin'));
app.use('/api', require('./routes-student'));
app.use('/api', (_req, res) => res.status(404).json({ error: 'Route API introuvable.' }));

// ---------- Frontend ----------
// Tous les fichiers sont à la racine du projet : on ne sert QUE les fichiers du site
// (jamais le code serveur, la base de données ou les PDF).
const FRONTEND_FILES = {
  'index.html': 'text/html; charset=utf-8',
  'style.css': 'text/css; charset=utf-8',
  'app.js': 'text/javascript; charset=utf-8',
  'api.js': 'text/javascript; charset=utf-8',
  'ui.js': 'text/javascript; charset=utf-8',
  'views.js': 'text/javascript; charset=utf-8',
  'admin-ui.js': 'text/javascript; charset=utf-8',
  'sw.js': 'text/javascript; charset=utf-8',
  'manifest.json': 'application/manifest+json; charset=utf-8',
  'icon.svg': 'image/svg+xml',
};
app.get(['/', '/:file'], (req, res, next) => {
  const file = req.params.file || 'index.html';
  if (!FRONTEND_FILES[file]) return next();
  res.type(FRONTEND_FILES[file]);
  // index.html et le service worker sont toujours revalidés pour que les mises à jour arrivent
  res.setHeader('Cache-Control', file === 'index.html' || file === 'sw.js' ? 'no-cache' : 'public, max-age=3600');
  res.sendFile(path.join(__dirname, file));
});
app.use((_req, res) => res.status(404).send('Page introuvable'));

// ---------- Gestion des erreurs ----------
// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  if (err.code === 'LIMIT_FILE_SIZE') return res.status(413).json({ error: 'Fichier trop volumineux (60 Mo maximum).' });
  const status = err.status || 500;
  if (status >= 500) console.error(err);
  res.status(status).json({ error: status >= 500 ? 'Erreur serveur. Réessayez dans un instant.' : err.message });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`FinPrep démarré sur http://localhost:${PORT}`));
