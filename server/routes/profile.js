const express = require("express");
const db = require("../db");
const { requireAuth } = require("../auth");

const router = express.Router();

// Everything the app needs to draw the stats page, in one request.
function buildProfile(userId) {
  const totals = db
    .prepare("SELECT COUNT(*) AS tests, COALESCE(SUM(elapsed_ms), 0) AS ms FROM tests WHERE user_id = ?")
    .get(userId);

  const history = db
    .prepare(
      "SELECT created_at AS t, mode AS m, target AS n, net_wpm AS w, raw_wpm AS r, accuracy AS a, consistency AS c, keys AS k FROM tests WHERE user_id = ? ORDER BY created_at DESC, id DESC LIMIT 100"
    )
    .all(userId)
    .reverse();

  const bests = {};
  db.prepare("SELECT mode, target, MAX(net_wpm) AS w FROM tests WHERE user_id = ? AND mode IN ('time','words') GROUP BY mode, target")
    .all(userId)
    .forEach((r) => { bests[r.mode + "_" + r.target] = r.w; });

  const bestAcc = db.prepare("SELECT MAX(accuracy) AS a FROM tests WHERE user_id = ? AND keys >= 20").get(userId).a || 0;

  const keys = {};
  db.prepare("SELECT code, correct AS c, incorrect AS i FROM key_stats WHERE user_id = ?")
    .all(userId)
    .forEach((r) => { keys[r.code] = { c: r.c, i: r.i }; });

  const pairs = {};
  db.prepare("SELECT pair, count FROM pairs WHERE user_id = ? ORDER BY count DESC LIMIT 40")
    .all(userId)
    .forEach((r) => { pairs[r.pair] = r.count; });

  const words = {};
  db.prepare("SELECT word, count FROM word_misses WHERE user_id = ? ORDER BY count DESC LIMIT 40")
    .all(userId)
    .forEach((r) => { words[r.word] = r.count; });

  const ach = {};
  db.prepare("SELECT id, unlocked_at FROM achievements WHERE user_id = ?")
    .all(userId)
    .forEach((r) => { ach[r.id] = r.unlocked_at; });

  const notifs = db
    .prepare("SELECT id, text AS x, created_at AS t, read FROM notifications WHERE user_id = ? ORDER BY created_at DESC, id DESC LIMIT 30")
    .all(userId)
    .map((r) => ({ id: String(r.id), x: r.x, t: r.t, read: !!r.read }));

  const seen = db.prepare("SELECT seen_updates_at AS s FROM users WHERE id = ?").get(userId).s;

  return { v: 1, tests: totals.tests, ms: totals.ms, history, bests, bestAcc, keys, pairs, words, ach, notifs, seen };
}

router.get("/", requireAuth, (req, res) => {
  res.json(buildProfile(req.user.id));
});

// Erase this member's typing history and totals. Comments stay.
router.delete("/", requireAuth, (req, res) => {
  const id = req.user.id;
  db.transaction(() => {
    ["tests", "key_stats", "pairs", "word_misses", "achievements", "notifications"].forEach((t) =>
      db.prepare("DELETE FROM " + t + " WHERE user_id = ?").run(id)
    );
  })();
  res.json({ ok: true });
});

module.exports = router;
