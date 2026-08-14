-- Migration 0002 — add welcomed_at to signups (signups-reactor bookkeeping).
--
-- schema.sql is the source of truth for a fresh database and carries
-- welcomed_at as of this change; this file brings an already-created database
-- up to it.
--
-- The fleet's signups reactor (baxter-control, `baxctl signups-watch`) polls
-- this table for rows where welcomed_at IS NULL (and consent + terms_agreed
-- are set), provisions a household for each, then stamps welcomed_at with the
-- ISO time it was handled — NULL means "not yet handled", so a row is
-- processed exactly once. Nullable with no default, so unlike 0001's nickname
-- this is a plain ALTER: no rebuild, existing rows are simply unhandled.
--
-- Run once against the live database:
--   npx wrangler d1 execute baxter-family --remote --file=migrations/0002_signups_add_welcomed_at.sql

ALTER TABLE signups ADD COLUMN welcomed_at TEXT;
