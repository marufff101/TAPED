const express = require("express");
const bcrypt = require("bcryptjs");
const db = require("../db");
const config = require("../config");
const { issueCookie, clearCookie, requireAuth, publicUser } = require("../auth");

const router = express.Router();
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
// Compared against when an email is unknown, so a wrong email and a wrong password take the same time.
const DUMMY_HASH = bcrypt.hashSync("not-a-real-password", 11);

function clean(s) {
  return typeof s === "string" ? s.trim() : "";
}

router.get("/me", (req, res) => {
  res.json({ user: req.user ? publicUser(req.user) : null });
});

const crypto = require("crypto");
const { sendCode } = require("../mailer");

const CODE_TTL = 10 * 60 * 1000;
const RESEND_GAP = 45 * 1000;
const MAX_ATTEMPTS = 5;
const hashCode = (email, code) => crypto.createHmac("sha256", config.JWT_SECRET).update(email + ":" + code).digest("hex");

// Creates (or replaces) a code for this email and sends it.
async function issueCode(email, purpose, extra) {
  const code = String(crypto.randomInt(0, 1000000)).padStart(6, "0");
  const now = Date.now();
  db.prepare(
    `INSERT INTO email_codes (email, purpose, code_hash, name, password_hash, expires_at, attempts, last_sent_at)
     VALUES (?, ?, ?, ?, ?, ?, 0, ?)
     ON CONFLICT(email, purpose) DO UPDATE SET code_hash = excluded.code_hash, name = excluded.name,
       password_hash = excluded.password_hash, expires_at = excluded.expires_at, attempts = 0, last_sent_at = excluded.last_sent_at`
  ).run(email, purpose, hashCode(email, code), extra.name || null, extra.hash || null, now + CODE_TTL, now);
  return sendCode(email, code, purpose);
}

// Checks a submitted code. Returns the stored row on success, or an error message.
function checkCode(email, purpose, code) {
  const row = db.prepare("SELECT * FROM email_codes WHERE email = ? AND purpose = ?").get(email, purpose);
  if (!row) return { error: "No code is waiting for this email. Request a new one." };
  if (row.expires_at < Date.now()) return { error: "That code has expired. Request a new one." };
  if (row.attempts >= MAX_ATTEMPTS) return { error: "Too many wrong tries. Request a new code." };
  const given = Buffer.from(hashCode(email, String(code || "").trim()));
  const real = Buffer.from(row.code_hash);
  if (given.length !== real.length || !crypto.timingSafeEqual(given, real)) {
    db.prepare("UPDATE email_codes SET attempts = attempts + 1 WHERE email = ? AND purpose = ?").run(email, purpose);
    return { error: "That code is wrong." };
  }
  return { row };
}
const dropCode = (email, purpose) => db.prepare("DELETE FROM email_codes WHERE email = ? AND purpose = ?").run(email, purpose);
const recentlySent = (email, purpose) => {
  const r = db.prepare("SELECT last_sent_at FROM email_codes WHERE email = ? AND purpose = ?").get(email, purpose);
  return r && Date.now() - r.last_sent_at < RESEND_GAP;
};

// Step 1: validate the details and email a code. No account exists yet.
router.post("/signup", async (req, res, next) => {
  try {
    const name = clean(req.body.name).replace(/\s+/g, " ");
    const email = clean(req.body.email).toLowerCase();
    const password = typeof req.body.password === "string" ? req.body.password : "";

    if (name.length < 2 || name.length > 40) return res.status(400).json({ error: "Enter a name between 2 and 40 characters." });
    if (!EMAIL_RE.test(email) || email.length > 120) return res.status(400).json({ error: "Enter a valid email address." });
    if (password.length < 8 || password.length > 100) return res.status(400).json({ error: "Use a password between 8 and 100 characters." });
    if (email === config.HOST_EMAIL) return res.status(403).json({ error: "This email belongs to the site host. Sign in instead." });
    if (db.prepare("SELECT 1 FROM users WHERE email = ?").get(email)) {
      return res.status(409).json({ error: "An account with this email already exists. Sign in instead." });
    }
    if (recentlySent(email, "signup")) return res.status(429).json({ error: "A code was just sent. Wait a few seconds before asking for another." });

    const sent = await issueCode(email, "signup", { name, hash: bcrypt.hashSync(password, 11) });
    res.json({ pending: true, email, dev: sent.dev });
  } catch (e) { next(e); }
});

// Step 2: the code from the email creates the account and signs the person in.
router.post("/verify", (req, res) => {
  const email = clean(req.body.email).toLowerCase();
  const checked = checkCode(email, "signup", req.body.code);
  if (checked.error) return res.status(400).json({ error: checked.error });
  const row = checked.row;
  if (db.prepare("SELECT 1 FROM users WHERE email = ?").get(email)) {
    dropCode(email, "signup");
    return res.status(409).json({ error: "This email already has an account. Sign in instead." });
  }
  const info = db
    .prepare("INSERT INTO users (name, email, password_hash, role, created_at) VALUES (?, ?, ?, 'member', ?)")
    .run(row.name, email, row.password_hash, Date.now());
  db.prepare("INSERT INTO notifications (user_id, text, created_at) VALUES (?, ?, ?)").run(
    info.lastInsertRowid, "Welcome to Taped. Your email is verified and your typing history is saved to your account now.", Date.now());
  dropCode(email, "signup");
  const user = db.prepare("SELECT id, name, email, role FROM users WHERE id = ?").get(info.lastInsertRowid);
  issueCookie(res, user);
  res.status(201).json({ user: publicUser(user) });
});

// Send the signup code again (same name and password).
router.post("/resend", async (req, res, next) => {
  try {
    const email = clean(req.body.email).toLowerCase();
    const row = db.prepare("SELECT name, password_hash FROM email_codes WHERE email = ? AND purpose = 'signup'").get(email);
    if (!row) return res.status(400).json({ error: "Start again: enter your details to get a new code." });
    if (recentlySent(email, "signup")) return res.status(429).json({ error: "A code was just sent. Wait a few seconds before asking for another." });
    const sent = await issueCode(email, "signup", { name: row.name, hash: row.password_hash });
    res.json({ ok: true, dev: sent.dev });
  } catch (e) { next(e); }
});

// Forgot password: always answers the same way, so it can't be used to find out who has an account.
router.post("/forgot", async (req, res, next) => {
  try {
    const email = clean(req.body.email).toLowerCase();
    if (EMAIL_RE.test(email) && !recentlySent(email, "reset") && db.prepare("SELECT 1 FROM users WHERE email = ?").get(email)) {
      await issueCode(email, "reset", {});
    }
    res.json({ ok: true });
  } catch (e) { next(e); }
});
router.post("/reset", (req, res) => {
  const email = clean(req.body.email).toLowerCase();
  const password = typeof req.body.password === "string" ? req.body.password : "";
  if (password.length < 8 || password.length > 100) return res.status(400).json({ error: "Use a password between 8 and 100 characters." });
  const checked = checkCode(email, "reset", req.body.code);
  if (checked.error) return res.status(400).json({ error: checked.error });
  db.prepare("UPDATE users SET password_hash = ? WHERE email = ?").run(bcrypt.hashSync(password, 11), email);
  dropCode(email, "reset");
  const user = db.prepare("SELECT id, name, email, role FROM users WHERE email = ?").get(email);
  issueCookie(res, user);
  res.json({ user: publicUser(user) });
});

router.post("/login", (req, res) => {
  const email = clean(req.body.email).toLowerCase();
  const password = typeof req.body.password === "string" ? req.body.password : "";
  const row = db.prepare("SELECT id, name, email, role, password_hash FROM users WHERE email = ?").get(email);
  const ok = bcrypt.compareSync(password, row ? row.password_hash : DUMMY_HASH);
  if (!row || !ok) return res.status(401).json({ error: "Email or password is wrong." });
  issueCookie(res, row);
  res.json({ user: publicUser(row) });
});

router.post("/logout", (_req, res) => {
  clearCookie(res);
  res.json({ ok: true });
});

router.post("/password", requireAuth, (req, res) => {
  const current = typeof req.body.current === "string" ? req.body.current : "";
  const next = typeof req.body.next === "string" ? req.body.next : "";
  if (next.length < 8 || next.length > 100) return res.status(400).json({ error: "Use a new password between 8 and 100 characters." });
  const row = db.prepare("SELECT password_hash FROM users WHERE id = ?").get(req.user.id);
  if (!bcrypt.compareSync(current, row.password_hash)) return res.status(401).json({ error: "Your current password is wrong." });
  db.prepare("UPDATE users SET password_hash = ? WHERE id = ?").run(bcrypt.hashSync(next, 11), req.user.id);
  res.json({ ok: true });
});

module.exports = router;
