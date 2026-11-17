const path = require("path");
const Database = require("better-sqlite3");
const { DATA_DIR } = require("./config");

const db = new Database(path.join(DATA_DIR, "taped.db"));
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  name             TEXT    NOT NULL,
  email            TEXT    NOT NULL UNIQUE,
  password_hash    TEXT    NOT NULL,
  role             TEXT    NOT NULL DEFAULT 'member',   -- 'member' or 'host'
  created_at       INTEGER NOT NULL,
  seen_updates_at  INTEGER NOT NULL DEFAULT 0
);

-- One row per finished typing test. This is the typing history.
CREATE TABLE IF NOT EXISTS email_codes (
  email TEXT NOT NULL,
  purpose TEXT NOT NULL,              -- 'signup' or 'reset'
  code_hash TEXT NOT NULL,
  name TEXT,                          -- signup only
  password_hash TEXT,                 -- signup only: the chosen password, applied once the code is confirmed
  expires_at INTEGER NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  last_sent_at INTEGER NOT NULL,
  PRIMARY KEY (email, purpose)
);

CREATE TABLE IF NOT EXISTS tests (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at   INTEGER NOT NULL,
  mode         TEXT    NOT NULL,       -- time | words | quote | weak
  target       INTEGER,                -- seconds or word count, null for quote/weak
  net_wpm      INTEGER NOT NULL,
  raw_wpm      INTEGER NOT NULL,
  accuracy     REAL    NOT NULL,       -- 0..100, one decimal
  consistency  INTEGER,                -- 0..100, null when the test was too short
  keys         INTEGER NOT NULL,       -- every key pressed
  bad_keys     INTEGER NOT NULL,       -- keys that were wrong when pressed
  elapsed_ms   INTEGER NOT NULL,
  detail       TEXT                    -- JSON: per-key stats, slips and missed words for this test
);
CREATE INDEX IF NOT EXISTS idx_tests_user_time ON tests(user_id, created_at DESC);

-- Running totals used for weak-key training and the stats page.
CREATE TABLE IF NOT EXISTS key_stats (
  user_id   INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  code      INTEGER NOT NULL,          -- character code of the key that was expected
  correct   INTEGER NOT NULL DEFAULT 0,
  incorrect INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, code)
);
CREATE TABLE IF NOT EXISTS pairs (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  pair    TEXT    NOT NULL,            -- "<expected code>_<typed code>"
  count   INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, pair)
);
CREATE TABLE IF NOT EXISTS word_misses (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  word    TEXT    NOT NULL,            -- "<expected>><typed>"
  count   INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, word)
);

CREATE TABLE IF NOT EXISTS achievements (
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  id          TEXT    NOT NULL,
  unlocked_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, id)
);

CREATE TABLE IF NOT EXISTS notifications (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  text       TEXT    NOT NULL,
  created_at INTEGER NOT NULL,
  read       INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_notif_user ON notifications(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS comments (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body       TEXT    NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_comments_time ON comments(created_at DESC);

-- Posts from the host, shown to everyone and counted as unread notifications.
CREATE TABLE IF NOT EXISTS updates (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  title      TEXT    NOT NULL,
  body       TEXT    NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL
);
`);

module.exports = db;
