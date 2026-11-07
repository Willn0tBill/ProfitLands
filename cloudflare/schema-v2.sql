-- V2: normalized, opt-in multiplayer layout.
-- Legacy world_state rows are NOT dropped, overwritten, or implicitly migrated.
CREATE TABLE IF NOT EXISTS world_meta (
 world_id TEXT PRIMARY KEY NOT NULL,
 version INTEGER NOT NULL DEFAULT 0,
 metadata TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS world_players (
 world_id TEXT NOT NULL,
 uid TEXT NOT NULL,
 version INTEGER NOT NULL DEFAULT 0,
 payload TEXT NOT NULL,
 PRIMARY KEY(world_id,uid)
);
CREATE INDEX IF NOT EXISTS idx_world_players_region ON world_players(world_id);
-- Per-player CAS protects individual economic actions without forcing all
-- unrelated players through one regional version.
CREATE TABLE IF NOT EXISTS world_player_guards (
 world_id TEXT NOT NULL,
 uid TEXT NOT NULL,
 expected_version INTEGER NOT NULL,
 actual_version INTEGER NOT NULL,
 CONSTRAINT world_player_revision_match CHECK(expected_version=actual_version),
 PRIMARY KEY(world_id,uid)
);
CREATE TABLE IF NOT EXISTS world_receipts (
 world_id TEXT NOT NULL,
 receipt_key TEXT NOT NULL,
 at INTEGER NOT NULL,
 payload TEXT NOT NULL,
 PRIMARY KEY(world_id,receipt_key)
);
CREATE INDEX IF NOT EXISTS idx_world_receipts_age ON world_receipts(world_id,at);
-- CHECK constraint aborts the entire D1 batch if another request has committed
-- since a snapshot was read, preventing partial cross-player transfers.
CREATE TABLE IF NOT EXISTS world_guards (
 world_id TEXT PRIMARY KEY NOT NULL,
 expected_version INTEGER NOT NULL,
 actual_version INTEGER NOT NULL,
 CONSTRAINT world_revision_match CHECK(expected_version=actual_version)
);
