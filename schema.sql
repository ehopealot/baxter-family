-- Baxter Family AI — D1 schema.
--
--   wrangler d1 create baxter-family
--   wrangler d1 execute baxter-family --remote --file=schema.sql
--
-- Everything a form collects lands here, and the Cloudflare dashboard's D1
-- console renders any SELECT as a table, which is the "view the submissions"
-- surface. See README for the queries worth keeping around.

-- ── invites ────────────────────────────────────────────────────────────────
-- Two kinds share one table because they differ only in whether the invite
-- names a person:
--   personal — minted for one address; join.html locks the email field to it
--   open     — a code anybody holding it can use, for QR cards and the like
--
-- Codes live in the database rather than being signed tokens on purpose. A
-- signed token cannot be revoked without a server, cannot be counted, and has
-- to carry its whole payload in the URL, which makes for a dense QR. A row can
-- be revoked instantly, counted, expired, and referenced by a short code.
CREATE TABLE IF NOT EXISTS invites (
  code        TEXT PRIMARY KEY,
  kind        TEXT    NOT NULL CHECK (kind IN ('personal', 'open')),
  email       TEXT,             -- personal invites only
  label       TEXT,             -- for your own reference: 'Tilden QR card'
  max_uses    INTEGER,          -- NULL = unlimited
  used_count  INTEGER NOT NULL DEFAULT 0,
  expires_at  INTEGER,          -- unix seconds; NULL = never
  revoked     INTEGER NOT NULL DEFAULT 0,
  created_at  INTEGER NOT NULL
);

-- ── signups (join.html) ────────────────────────────────────────────────────
-- status is the hook for provisioning later: new -> provisioning -> active.
-- Nothing reads it today beyond you.
CREATE TABLE IF NOT EXISTS signups (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at  INTEGER NOT NULL,
  name        TEXT    NOT NULL,
  nickname    TEXT    NOT NULL,   -- what Baxter calls you
  household   TEXT    NOT NULL,
  email       TEXT    NOT NULL,
  phone       TEXT,             -- optional: Baxter works over email alone
  consent     INTEGER NOT NULL DEFAULT 0,   -- optional: messaging opt-in
  -- Required. Ticking it is where the agreement is formed and where the signer
  -- confirms they're 18, so the version they agreed to is worth keeping: terms
  -- change, and "they accepted the terms" is worth little without "which ones".
  terms_agreed   INTEGER NOT NULL DEFAULT 0,
  terms_version  TEXT,
  invite_code TEXT REFERENCES invites(code),
  status      TEXT    NOT NULL DEFAULT 'new',
  ip          TEXT,
  user_agent  TEXT,
  -- Set (ISO time) by the fleet's signups reactor when the household is
  -- provisioned + welcomed; NULL = not yet handled, so each row is processed once.
  welcomed_at TEXT
);

-- ── waiting list (index.html) ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS waitlist (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at  INTEGER NOT NULL,
  name        TEXT    NOT NULL,
  email       TEXT    NOT NULL,
  status      TEXT    NOT NULL DEFAULT 'new',
  ip          TEXT,
  user_agent  TEXT
);

-- household becomes an email address, so it has to be unique. A UNIQUE index
-- rather than a check-then-insert in the handler: the check-then-insert races.
CREATE UNIQUE INDEX IF NOT EXISTS idx_signups_household ON signups (household);

CREATE INDEX IF NOT EXISTS idx_signups_created  ON signups (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_signups_email    ON signups (email);
CREATE INDEX IF NOT EXISTS idx_signups_status   ON signups (status);
CREATE INDEX IF NOT EXISTS idx_waitlist_created ON waitlist (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_waitlist_email   ON waitlist (email);
