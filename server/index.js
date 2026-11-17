const path = require("path");
const express = require("express");
const helmet = require("helmet");
const cookieParser = require("cookie-parser");
const rateLimit = require("express-rate-limit");

const config = require("./config");
require("./db");
const { attachUser, ensureHost } = require("./auth");

ensureHost();

const app = express();
if (config.TRUST_PROXY) app.set("trust proxy", 1);

app.use(
  helmet({
    contentSecurityPolicy: {
      useDefaults: true,
      directives: {
        "default-src": ["'self'"],
        "script-src": ["'self'"],
        "style-src": ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
        "font-src": ["'self'", "https://fonts.gstatic.com"],
        "img-src": ["'self'", "data:"],
        "connect-src": ["'self'"],
        "upgrade-insecure-requests": null,
      },
    },
  })
);
app.use(cookieParser());
app.use(express.json({ limit: "100kb" }));

// Block cross-site writes: a browser that sends an Origin must be talking to us.
app.use((req, res, next) => {
  if (["POST", "PUT", "PATCH", "DELETE"].includes(req.method)) {
    const origin = req.get("origin");
    if (origin) {
      let same = false;
      try { same = new URL(origin).host === req.get("host"); } catch (_) {}
      if (!same) return res.status(403).json({ error: "Cross-site request blocked." });
    }
  }
  next();
});

app.use("/api", rateLimit({ windowMs: 60 * 1000, limit: 300, standardHeaders: "draft-7", legacyHeaders: false }));
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, limit: 30, standardHeaders: "draft-7", legacyHeaders: false,
  message: { error: "Too many attempts. Wait a few minutes and try again." },
});
const writeLimiter = rateLimit({
  windowMs: 60 * 1000, limit: 20, standardHeaders: "draft-7", legacyHeaders: false,
  message: { error: "You're posting too fast. Wait a moment." },
});

app.use("/api", attachUser);
app.use("/api/auth/login", authLimiter);
app.use("/api/auth/signup", authLimiter);
app.use("/api/auth/verify", authLimiter);
app.use("/api/auth/resend", authLimiter);
app.use("/api/auth/forgot", authLimiter);
app.use("/api/auth/reset", authLimiter);
app.post("/api/comments", writeLimiter);

app.use("/api/auth", require("./routes/auth"));
app.use("/api/tests", require("./routes/tests"));
app.use("/api/profile", require("./routes/profile"));
app.use("/api/admin", require("./routes/admin"));
app.use("/api", require("./routes/social"));

app.use("/api", (_req, res) => res.status(404).json({ error: "Not found." }));

app.use(express.static(path.join(__dirname, "..", "public"), { extensions: ["html"] }));

// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  if (err && err.type === "entity.parse.failed") return res.status(400).json({ error: "That request wasn't valid JSON." });
  console.error(err);
  res.status(500).json({ error: "Something went wrong on the server." });
});

app.listen(config.PORT, () => {
  console.log("Taped is running at http://localhost:" + config.PORT);
});
