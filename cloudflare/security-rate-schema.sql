-- Apply explicitly before enabling SECURITY_D1_RATE_LIMIT=enabled.
-- Additive and non-destructive: existing regional players/receipts are untouched.
CREATE TABLE IF NOT EXISTS world_abuse_limits (
  account_key TEXT PRIMARY KEY NOT NULL,
  window_start INTEGER NOT NULL CHECK (window_start >= 0),
  hits INTEGER NOT NULL CHECK (hits >= 1 AND hits <= 12)
);
