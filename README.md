# Taped

A typing-practice site that finds your weak keys. Node + Express + SQLite backend, plain HTML/CSS/JS frontend.

## Run it

```bash
npm install
cp .env.example .env      # optional, then edit it
npm start                 # http://localhost:3000
```

Needs Node 20 or newer.

## The host account

`marufff08697@gmail.com` is the host (admin). The account is created the first time the server starts.

- Set `HOST_PASSWORD` in `.env` to choose its password, **or** leave it empty and a random password is printed once in the terminal. Save it.
- Nobody can sign up with the host email, so no one can take the account over.
- The host gets a **Host** tab: site totals, every member with their test count and best wpm, any member's recent typing history, and removing members. The host can also post updates (they notify everyone) and delete any comment.

## Email verification

Signing up works in two steps: the person enters name, email and a password, Taped emails a 6-digit code (valid 10 minutes, 5 tries), and the account is only created once the code is entered. "Forgot password?" uses the same code flow.

To send real emails, fill in the `SMTP_*` lines in `.env` (the `.env.example` has a Gmail setup). Without them the code is printed in the terminal, which is fine for trying it out but means real users get nothing, so set SMTP before going public.

## What the backend does

| Feature | Endpoint |
|---|---|
| Sign up with email code, sign in / out, reset or change password | `POST /api/auth/signup`, `/verify`, `/resend`, `/login`, `/logout`, `/forgot`, `/reset`, `/password`, `GET /api/auth/me` |
| Save a finished test | `POST /api/tests` |
| Typing history (paged) and CSV download | `GET /api/tests`, `GET /api/tests/export.csv` |
| Stats, weak keys, badges, notifications | `GET /api/profile`, `DELETE /api/profile` |
| Comments (anyone reads, members post) | `GET/POST /api/comments`, `DELETE /api/comments/:id` |
| Updates (host posts) | `GET/POST /api/updates`, `DELETE /api/updates/:id` |
| Host dashboard | `/api/admin/overview`, `/users`, `/users/:id/tests` |

Every finished test is stored with net wpm, raw wpm, accuracy, consistency, keys pressed, mistyped keys and duration, plus per-key and per-word mistakes that feed the weak-key training. Guests (not signed in) still get stats, kept in the browser only.

## Security notes

- Passwords are hashed with bcrypt. Login is a signed JWT in an httpOnly, SameSite=Lax cookie.
- Cross-site writes are blocked, login/signup and comment posting are rate limited, a strict Content-Security-Policy is set, and all test numbers are range-checked on the server.
- For a public site: serve it over https and set `COOKIE_SECURE=true`, `TRUST_PROXY=true` (behind a proxy) and a long `JWT_SECRET`.

## Layout

```
server/        index.js, config.js, db.js, auth.js, routes/
public/        index.html, css/style.css, js/app.js
data/          taped.db (created on first run, git-ignored)
```

Back up `data/taped.db` to back up all accounts and history.
