const express = require("express");
const db = require("../db");
const { requireAuth } = require("../auth");

const router = express.Router();
const MODES = ["time", "words", "quote", "weak"];

const ACHIEVEMENTS = [
  { id: "first", test: (t, n) => n >= 1, text: "First test finished. Taped is tracking your weak keys now." },
  { id: "w40", test: (t) => t.net >= 40, text: "Badge unlocked: 40 wpm." },
  { id: "w60", test: (t) => t.net >= 60, text: "Badge unlocked: 60 wpm." },
  { id: "w80", test: (t) => t.net >= 80, text: "Badge unlocked: 80 wpm." },
  { id: "w100", test: (t) => t.net >= 100, text: "Badge unlocked: 100 wpm." },
  { id: "perfect", test: (t) => t.acc >= 100 && t.keys >= 40, text: "Badge unlocked: a perfect run, 100% accuracy over 40+ keys." },
  { id: "ten", test: (t, n) => n >= 10, text: "Badge unlocked: 10 tests completed." },
];

function int(v, min, max) {
  const n = Number(v);
  if (!Number.isFinite(n) || !Number.isInteger(n) || n < min || n > max) return null;
  return n;
}

// Accepts { "<code>": { c, i } } and keeps only well-formed entries.
function cleanKeyStats(obj) {
  const out = [];
  if (!obj || typeof obj !== "object") return out;
  for (const k of Object.keys(obj).slice(0, 128)) {
    if (!/^\d{1,3}$/.test(k)) continue;
    const c = int(obj[k] && obj[k].c, 0, 5000);
    const i = int(obj[k] && obj[k].i, 0, 5000);
    if (c === null || i === null) continue;
    out.push([Number(k), c, i]);
  }
  return out;
}
function cleanPairs(obj) {
  const out = [];
  if (!obj || typeof obj !== "object") return out;
  for (const k of Object.keys(obj).slice(0, 200)) {
    if (!/^\d{1,3}_\d{1,3}$/.test(k)) continue;
    const n = int(obj[k], 1, 5000);
    if (n !== null) out.push([k, n]);
  }
  return out;
}
function cleanWords(obj) {
  const out = [];
  if (!obj || typeof obj !== "object") return out;
  for (const k of Object.keys(obj).slice(0, 200)) {
    if (!/^[\x20-\x7E]{3,90}$/.test(k) || k.indexOf(">") < 1) continue;
    const n = int(obj[k], 1, 5000);
    if (n !== null) out.push([k, n]);
  }
  return out;
}

const insertTest = db.prepare(`
  INSERT INTO tests (user_id, created_at, mode, target, net_wpm, raw_wpm, accuracy, consistency, keys, bad_keys, elapsed_ms, detail)
  VALUES (@user_id, @created_at, @mode, @target, @net, @raw, @acc, @cons, @keys, @bad, @elapsed, @detail)
`);
const upsertKey = db.prepare(`
  INSERT INTO key_stats (user_id, code, correct, incorrect) VALUES (?, ?, ?, ?)
  ON CONFLICT(user_id, code) DO UPDATE SET correct = correct + excluded.correct, incorrect = incorrect + excluded.incorrect
`);
const upsertPair = db.prepare(`
  INSERT INTO pairs (user_id, pair, count) VALUES (?, ?, ?)
  ON CONFLICT(user_id, pair) DO UPDATE SET count = count + excluded.count
`);
const upsertWord = db.prepare(`
  INSERT INTO word_misses (user_id, word, count) VALUES (?, ?, ?)
  ON CONFLICT(user_id, word) DO UPDATE SET count = count + excluded.count
`);

// Save a finished test and update the running totals.
router.post("/", requireAuth, (req, res) => {
  const b = req.body || {};
  const mode = MODES.includes(b.mode) ? b.mode : null;
  const target = b.target === null || b.target === undefined ? null : int(b.target, 1, 1000);
  const net = int(b.net, 0, 400);
  const raw = int(b.raw, 0, 600);
  const keys = int(b.keys, 1, 5000);
  const bad = int(b.bad, 0, 5000);
  const elapsed = int(b.elapsed, 500, 3600000);
  const acc = Number(b.acc);
  const cons = b.cons === null || b.cons === undefined ? null : int(b.cons, 0, 100);

  const valid =
    mode && net !== null && raw !== null && keys !== null && bad !== null && elapsed !== null &&
    Number.isFinite(acc) && acc >= 0 && acc <= 100 && bad <= keys && (b.target == null || target !== null) &&
    (b.cons == null || cons !== null);
  if (!valid) return res.status(400).json({ error: "That test result could not be saved because some numbers were out of range." });

  const userId = req.user.id;
  const now = Date.now();
  const accuracy = Math.floor(acc * 10) / 10;
  const keyStats = cleanKeyStats(b.keyStats);
  const pairs = cleanPairs(b.pairs);
  const words = cleanWords(b.wordMiss);

  const save = db.transaction(() => {
    // Personal best is judged against earlier tests of the same mode and length.
    let pb = false, had = false;
    if (mode === "time" || mode === "words") {
      const prev = db
        .prepare("SELECT MAX(net_wpm) AS best FROM tests WHERE user_id = ? AND mode = ? AND target IS ?")
        .get(userId, mode, target);
      had = prev.best !== null;
      pb = !had || net > prev.best;
    }
    const info = insertTest.run({
      user_id: userId, created_at: now, mode, target, net, raw, acc: accuracy, cons, keys, bad, elapsed,
      detail: JSON.stringify({ keyStats: b.keyStats && typeof b.keyStats === "object" ? Object.fromEntries(keyStats.map((k) => [k[0], { c: k[1], i: k[2] }])) : {}, pairs: Object.fromEntries(pairs), words: Object.fromEntries(words) }),
    });
    keyStats.forEach(([code, c, i]) => upsertKey.run(userId, code, c, i));
    pairs.forEach(([k, n]) => upsertPair.run(userId, k, n));
    words.forEach(([k, n]) => upsertWord.run(userId, k, n));

    const notify = db.prepare("INSERT INTO notifications (user_id, text, created_at) VALUES (?, ?, ?)");
    const messages = [];
    if (had && pb) {
      messages.push("New personal best: " + net + " wpm on " + (mode === "time" ? target + "s" : target + " words") + ".");
    }
    const total = db.prepare("SELECT COUNT(*) AS n FROM tests WHERE user_id = ?").get(userId).n;
    const t = { net, acc: accuracy, keys };
    for (const a of ACHIEVEMENTS) {
      if (!a.test(t, total)) continue;
      const r = db.prepare("INSERT OR IGNORE INTO achievements (user_id, id, unlocked_at) VALUES (?, ?, ?)").run(userId, a.id, now);
      if (r.changes) messages.push(a.text);
    }
    messages.forEach((m) => notify.run(userId, m, now));
    return { id: info.lastInsertRowid, pb, notifications: messages };
  });

  res.status(201).json(save());
});

function rowToTest(r) {
  return {
    id: r.id, t: r.created_at, m: r.mode, n: r.target, w: r.net_wpm, r: r.raw_wpm,
    a: r.accuracy, c: r.consistency, k: r.keys, bad: r.bad_keys, ms: r.elapsed_ms,
  };
}

// Paged typing history, newest first.
router.get("/", requireAuth, (req, res) => {
  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 25, 1), 200);
  const offset = Math.max(parseInt(req.query.offset, 10) || 0, 0);
  const rows = db
    .prepare("SELECT * FROM tests WHERE user_id = ? ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?")
    .all(req.user.id, limit, offset);
  const total = db.prepare("SELECT COUNT(*) AS n FROM tests WHERE user_id = ?").get(req.user.id).n;
  res.json({ tests: rows.map(rowToTest), total });
});

router.get("/export.csv", requireAuth, (req, res) => {
  const rows = db.prepare("SELECT * FROM tests WHERE user_id = ? ORDER BY created_at ASC, id ASC").all(req.user.id);
  const head = ["date", "mode", "target", "net_wpm", "raw_wpm", "accuracy", "consistency", "keys_pressed", "mistyped_keys", "seconds"];
  const lines = [head.join(",")];
  rows.forEach((r) =>
    lines.push(
      [new Date(r.created_at).toISOString(), r.mode, r.target ?? "", r.net_wpm, r.raw_wpm, r.accuracy, r.consistency ?? "", r.keys, r.bad_keys, (r.elapsed_ms / 1000).toFixed(1)].join(",")
    )
  );
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", 'attachment; filename="taped-history.csv"');
  res.send(lines.join("\n") + "\n");
});

module.exports = router;
