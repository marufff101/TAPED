const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
require("dotenv").config();

const IS_PROD = process.env.NODE_ENV === "production";
const DATA_DIR = process.env.DATA_DIR
  ? path.resolve(process.env.DATA_DIR)
  : path.join(__dirname, "..", "data");
fs.mkdirSync(DATA_DIR, { recursive: true });

// The signing secret for login cookies. Set JWT_SECRET in production. If it is
// missing, a random one is created once and kept in the data folder, so logins
// survive restarts without anyone having to hand-write a secret.
function loadSecret() {
  if (process.env.JWT_SECRET) return process.env.JWT_SECRET;
  const file = path.join(DATA_DIR, ".jwt_secret");
  if (fs.existsSync(file)) return fs.readFileSync(file, "utf8").trim();
  const secret = crypto.randomBytes(48).toString("hex");
  fs.writeFileSync(file, secret, { mode: 0o600 });
  return secret;
}

module.exports = {
  IS_PROD,
  DATA_DIR,
  PORT: Number(process.env.PORT) || 3000,
  HOST_EMAIL: (process.env.HOST_EMAIL || "marufff08697@gmail.com").trim().toLowerCase(),
  HOST_NAME: (process.env.HOST_NAME || "Maruf").trim(),
  HOST_PASSWORD: process.env.HOST_PASSWORD || "",
  JWT_SECRET: loadSecret(),
  // Set COOKIE_SECURE=true when the site is served over https.
  COOKIE_SECURE: process.env.COOKIE_SECURE === "true",
  // Email (for verification codes). Without SMTP_HOST, codes are printed in the server terminal instead.
  SMTP: {
    host: process.env.SMTP_HOST || "",
    port: Number(process.env.SMTP_PORT) || 587,
    secure: process.env.SMTP_SECURE === "true",
    user: process.env.SMTP_USER || "",
    pass: process.env.SMTP_PASS || "",
    from: process.env.MAIL_FROM || process.env.SMTP_USER || "Taped <no-reply@localhost>",
  },
  TRUST_PROXY: process.env.TRUST_PROXY === "true",
};
