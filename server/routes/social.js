const express = require("express");
const db = require("../db");
const { requireAuth, requireHost } = require("../auth");

const router = express.Router();

/* ---------- Comments: anyone can read, only signed-in members can post ---------- */

router.get("/comments", (req, res) => {
  const rows = db
    .prepare(
      `SELECT c.id, c.user_id, c.body, c.created_at, u.name, u.role
       FROM comments c JOIN users u ON u.id = c.user_id
       ORDER BY c.created_at DESC, c.id DESC LIMIT 100`
    )
    .all();
  res.json({
    comments: rows.map((r) => ({
      id: r.id,
      uid: r.user_id,
      name: r.name,
      host: r.role === "host",
      body: r.body,
      t: r.created_at,
    })),
  });
});

router.post("/comments", requireAuth, (req, res) => {
  const body = typeof req.body.body === "string" ? req.body.body.trim() : "";
  if (!body) return res.status(400).json({ error: "Write something before posting." });
  if (body.length > 500) return res.status(400).json({ error: "Comments can be up to 500 characters." });
  const now = Date.now();
  const info = db.prepare("INSERT INTO comments (user_id, body, created_at) VALUES (?, ?, ?)").run(req.user.id, body, now);
  res.status(201).json({
    comment: { id: info.lastInsertRowid, uid: req.user.id, name: req.user.name, host: req.user.role === "host", body, t: now },
  });
});

router.delete("/comments/:id", requireAuth, (req, res) => {
  const row = db.prepare("SELECT user_id FROM comments WHERE id = ?").get(req.params.id);
  if (!row) return res.status(404).json({ error: "That comment no longer exists." });
  if (row.user_id !== req.user.id && req.user.role !== "host") {
    return res.status(403).json({ error: "You can only delete your own comments." });
  }
  db.prepare("DELETE FROM comments WHERE id = ?").run(req.params.id);
  res.json({ ok: true });
});

/* ---------- Updates: posted by the host, readable by everyone ---------- */

router.get("/updates", (_req, res) => {
  const rows = db.prepare("SELECT id, title, body, created_at AS ts FROM updates ORDER BY created_at DESC, id DESC LIMIT 30").all();
  res.json({ updates: rows });
});

router.post("/updates", requireHost, (req, res) => {
  const title = typeof req.body.title === "string" ? req.body.title.trim() : "";
  const body = typeof req.body.body === "string" ? req.body.body.trim() : "";
  if (!title || title.length > 80) return res.status(400).json({ error: "Give the update a title of up to 80 characters." });
  if (body.length > 400) return res.status(400).json({ error: "The update text can be up to 400 characters." });
  const now = Date.now();
  const info = db.prepare("INSERT INTO updates (title, body, created_at) VALUES (?, ?, ?)").run(title, body, now);
  res.status(201).json({ update: { id: info.lastInsertRowid, title, body, ts: now } });
});

router.delete("/updates/:id", requireHost, (req, res) => {
  db.prepare("DELETE FROM updates WHERE id = ?").run(req.params.id);
  res.json({ ok: true });
});

/* ---------- Notifications ---------- */

router.post("/notifications/read", requireAuth, (req, res) => {
  const now = Date.now();
  db.prepare("UPDATE notifications SET read = 1 WHERE user_id = ?").run(req.user.id);
  db.prepare("UPDATE users SET seen_updates_at = ? WHERE id = ?").run(now, req.user.id);
  res.json({ seen: now });
});

module.exports = router;
