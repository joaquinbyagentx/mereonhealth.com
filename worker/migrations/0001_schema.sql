-- Mereon checkout D1 schema. Apply once; seed inventory in 0002.
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS inventory (
  code TEXT PRIMARY KEY,
  on_hand INTEGER NOT NULL CHECK (on_hand >= 0),
  reserved INTEGER NOT NULL DEFAULT 0 CHECK (reserved >= 0),
  sold INTEGER NOT NULL DEFAULT 0 CHECK (sold >= 0),
  updated_at INTEGER NOT NULL,
  CHECK (reserved <= on_hand)
);

CREATE TABLE IF NOT EXISTS orders (
  id TEXT PRIMARY KEY,
  order_number TEXT NOT NULL UNIQUE,
  public_token_hash TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL CHECK (status IN ('reserving','reserved','awaiting_payment','paid','paid_review','released','cancelled','creation_failed')),
  currency TEXT NOT NULL CHECK (currency = 'mxn'),
  lines_json TEXT NOT NULL,
  subtotal INTEGER NOT NULL CHECK (subtotal >= 0),
  shipping_id TEXT NOT NULL,
  shipping_label TEXT NOT NULL,
  shipping_amount INTEGER NOT NULL CHECK (shipping_amount >= 0),
  total INTEGER NOT NULL CHECK (total = subtotal + shipping_amount),
  included_iva INTEGER NOT NULL CHECK (included_iva >= 0 AND included_iva <= total),
  customer_json TEXT NOT NULL,
  ruo_accepted_at INTEGER NOT NULL,
  stripe_session_id TEXT UNIQUE,
  stripe_payment_intent_id TEXT,
  reservation_expires_at INTEGER NOT NULL,
  reserved_at INTEGER NOT NULL,
  paid_at INTEGER,
  released_at INTEGER,
  email_status TEXT NOT NULL DEFAULT 'pending' CHECK (email_status IN ('pending','sending','failed','sent')),
  email_claimed_at INTEGER,
  email_attempts INTEGER NOT NULL DEFAULT 0,
  email_message_id TEXT,
  email_last_error TEXT,
  email_next_attempt_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS order_reservations (
  order_id TEXT NOT NULL REFERENCES orders(id),
  code TEXT NOT NULL REFERENCES inventory(code),
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  PRIMARY KEY (order_id, code)
);

CREATE TABLE IF NOT EXISTS stripe_events (
  event_id TEXT PRIMARY KEY,
  event_type TEXT NOT NULL,
  stripe_created_at INTEGER,
  order_id TEXT,
  outcome TEXT NOT NULL,
  received_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS rate_limits (
  key_hash TEXT PRIMARY KEY,
  window_started_at INTEGER NOT NULL,
  count INTEGER NOT NULL CHECK (count >= 0)
);

CREATE INDEX IF NOT EXISTS orders_status_expiry ON orders(status, reservation_expires_at);
CREATE INDEX IF NOT EXISTS orders_email_retry ON orders(email_status, email_next_attempt_at);
