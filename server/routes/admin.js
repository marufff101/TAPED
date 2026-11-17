const express = require("express");
const db = require("../db");
const { requireHost } = require("../auth");

const router = express.Router();
router.use(requireHost);

router.get("/overview", (_req, res) => {
  const week = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const one = (sql, ...args) => db.prepare(sql).get(...args).n;
  res.json({
    users: one("SELECT COUNT(*) AS n FROM users"),
    newUsers7d: one("SELECT COUNT(*) AS n FROM users WHERE created_at > ?", week),
    tests: one("SELECT COUNT(*) AS n FROM tests"),
    tests7d: one("SELECT COUNT(*) AS n FROM tests WHERE created_at > ?", week),
    comments: one("SELECT COUNT(*) AS n FROM comments"),
    topWpm: db.prepare("SELECT MAX(net_wpm) AS n FROM tests").get().n || 0,
  });
});

router.get("/users", (_req, res) => {
  const rows = db
    .prepare(
      `SELECT u.id, u.name, u.email, u.role, u.created_at,
              COUNT(t.id) AS tests, COALESCE(MAX(t.net_wpm), 0) AS best_wpm, MAX(t.created_at) AS last_test
       FROM users u LEFT JOIN tests t ON t.user_id = u.id
       GROUP BY u.id ORDER BY u.created_at DESC`
    )
    .all();
  res.json({
    users: rows.map((r) => ({
      id: r.id, name: r.name, email: r.email, role: r.role, joined: r.created_at,
      tests: r.tests, bestWpm: r.best_wpm, lastTest: r.last_test,
    })),
  });
});

// A member's typing history, as the host sees it.
router.get("/users/:id/tests", (req, res) => {
  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 30, 1), 200);
  const rows = db
    .prepare(
      "SELECT id, created_at AS t, mode AS m, target AS n, net_wpm AS w, raw_wpm AS r, accuracy AS a, consistency AS c, keys AS k, bad_keys AS bad, elapsed_ms AS ms FROM tests WHERE user_id = ? ORDER BY created_at DESC, id DESC LIMIT ?"
    )
    .all(req.params.id, limit);
  res.json({ tests: rows });
});

router.delete("/users/:id", (req, res) => {
  const target = db.prepare("SELECT id, role FROM users WHERE id = ?").get(req.params.id);
  if (!target) return res.status(404).json({ error: "That member no longer exists." });
  if (target.role === "host") return res.status(400).json({ error: "The host account can't be removed." });
  db.prepare("DELETE FROM users WHERE id = ?").run(target.id);
  res.json({ ok: true });
});

module.exports = router;
