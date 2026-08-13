-- Migration 0001 — require a nickname on signups.
--
-- schema.sql is the source of truth for a fresh database and already carries
-- nickname; this file brings an already-created database up to it.
--
-- nickname is NOT NULL, and SQLite refuses `ALTER TABLE ... ADD COLUMN` for a
-- NOT NULL column with no default (it refuses regardless of how many rows are
-- present), so requiring it means rebuilding the table rather than altering it.
-- The one row that predates nickname is disposable, so it is not carried over —
-- the rebuild starts the table empty. Dropping signups also drops its indexes,
-- which are recreated below.
--
-- Run once against the live database:
--   wrangler d1 execute baxter-family --remote --file=migrations/0001_signups_add_nickname.sql

DROP TABLE IF EXISTS signups;

CREATE TABLE signups (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at  INTEGER NOT NULL,
  name        TEXT    NOT NULL,
  nickname    TEXT    NOT NULL,   -- what Baxter calls you
  household   TEXT    NOT NULL,
  email       TEXT    NOT NULL,
  phone       TEXT,
  consent     INTEGER NOT NULL DEFAULT 0,
  terms_agreed   INTEGER NOT NULL DEFAULT 0,
  terms_version  TEXT,
  invite_code TEXT REFERENCES invites(code),
  status      TEXT    NOT NULL DEFAULT 'new',
  ip          TEXT,
  user_agent  TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_signups_household ON signups (household);
CREATE INDEX IF NOT EXISTS idx_signups_created  ON signups (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_signups_email    ON signups (email);
CREATE INDEX IF NOT EXISTS idx_signups_status   ON signups (status);
