const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const db = require("./db");
const config = require("./config");

const COOKIE = "taped_token";
const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

function issueCookie(res, user) {
  const token = jwt.sign({ uid: user.id }, config.JWT_SECRET, { expiresIn: "30d" });
  res.cookie(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: config.COOKIE_SECURE,
    maxAge: MAX_AGE_MS,
    path: "/",
  });
}

function clearCookie(res) {
  res.clearCookie(COOKIE, { path: "/", httpOnly: true, sameSite: "lax", secure: config.COOKIE_SECURE });
}

// Puts req.user on every request: the signed-in member, or null for a guest.
function attachUser(req, _res, next) {
  req.user = null;
  const token = req.cookies && req.cookies[COOKIE];
  if (token) {
    try {
      const { uid } = jwt.verify(token, config.JWT_SECRET);
      req.user = db.prepare("SELECT id, name, email, role FROM users WHERE id = ?").get(uid) || null;
    } catch (_) {
      req.user = null;
    }
  }
  next();
}

function requireAuth(req, res, next) {
  if (!req.user) return res.status(401).json({ error: "Sign in to do that." });
  next();
}

function requireHost(req, res, next) {
  if (!req.user) return res.status(401).json({ error: "Sign in to do that." });
  if (req.user.role !== "host") return res.status(403).json({ error: "Only the host can do that." });
  next();
}

function publicUser(u) {
  return { id: u.id, name: u.name, email: u.email, role: u.role };
}

// Creates the host account the first time the server starts. Nobody can sign up
// with the host email, so the account cannot be claimed by someone else.
function ensureHost() {
  const existing = db.prepare("SELECT id, role FROM users WHERE email = ?").get(config.HOST_EMAIL);
  if (existing) {
    if (existing.role !== "host") db.prepare("UPDATE users SET role = 'host' WHERE id = ?").run(existing.id);
    return;
  }
  let password = config.HOST_PASSWORD;
  let generated = false;
  if (!password) {
    password = require("crypto").randomBytes(9).toString("base64url");
    generated = true;
  }
  const hash = bcrypt.hashSync(password, 11);
  db.prepare(
    "INSERT INTO users (name, email, password_hash, role, created_at) VALUES (?, ?, ?, 'host', ?)"
  ).run(config.HOST_NAME, config.HOST_EMAIL, hash, Date.now());
  console.log("");
  console.log("  Host account created");
  console.log("  Email:    " + config.HOST_EMAIL);
  if (generated) {
    console.log("  Password: " + password + "   (shown once, change it after signing in)");
  } else {
    console.log("  Password: taken from HOST_PASSWORD in your .env file");
  }
  console.log("");
}

module.exports = { issueCookie, clearCookie, attachUser, requireAuth, requireHost, publicUser, ensureHost };
