-- World 1: a single small, versioned ledger so cash and PvP are updated
-- in one atomic compare-and-swap, including replay receipts.
-- Never grant direct database write access to the browser.
CREATE TABLE IF NOT EXISTS world_state (
 id TEXT PRIMARY KEY NOT NULL,
 version INTEGER NOT NULL DEFAULT 0,
 payload TEXT NOT NULL
);
