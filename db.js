/**
 * Base de données SQLite (un seul fichier, zéro configuration).
 * Le schéma est créé automatiquement au démarrage.
 */
const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');

const DATA_DIR = path.resolve(process.env.DATA_DIR || path.join(__dirname, 'data'));
const UPLOAD_DIR = path.join(DATA_DIR, 'uploads');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const db = new Database(path.join(DATA_DIR, 'finprep.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    name          TEXT NOT NULL,
    email         TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    role          TEXT NOT NULL DEFAULT 'student' CHECK (role IN ('student', 'admin')),
    created_at    TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS modules (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    certification   TEXT NOT NULL,              -- CFA, ACCA, CAIA, CIIA...
    level           TEXT NOT NULL DEFAULT '',   -- "Level I", "Applied Skills"...
    title           TEXT NOT NULL,
    description     TEXT NOT NULL DEFAULT '',
    price_xof       INTEGER NOT NULL DEFAULT 0, -- prix en Francs CFA
    pdf_pages       INTEGER NOT NULL DEFAULT 0,
    exercises_count INTEGER NOT NULL DEFAULT 0,
    pdf_path        TEXT,                       -- nom du fichier dans DATA_DIR/uploads
    pdf_name        TEXT,                       -- nom proposé au téléchargement
    published       INTEGER NOT NULL DEFAULT 1,
    created_at      TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS questions (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    module_id     INTEGER NOT NULL REFERENCES modules(id) ON DELETE CASCADE,
    question      TEXT NOT NULL,
    options       TEXT NOT NULL,                -- tableau JSON des propositions
    correct_index INTEGER NOT NULL,
    explanation   TEXT NOT NULL DEFAULT '',
    created_at    TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS enrollments (
    user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    module_id    INTEGER NOT NULL REFERENCES modules(id) ON DELETE CASCADE,
    status       TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'active')),
    completed    INTEGER NOT NULL DEFAULT 0,
    completed_at TEXT,
    created_at   TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (user_id, module_id)
  );

  CREATE TABLE IF NOT EXISTS quiz_attempts (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    module_id  INTEGER NOT NULL REFERENCES modules(id) ON DELETE CASCADE,
    score      INTEGER NOT NULL,
    total      INTEGER NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_questions_module ON questions(module_id);
  CREATE INDEX IF NOT EXISTS idx_attempts_user_module ON quiz_attempts(user_id, module_id);
`);

module.exports = { db, DATA_DIR, UPLOAD_DIR };
