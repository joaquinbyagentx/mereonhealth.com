-- One-time physical inventory onboarding. D1 records numbered migrations once;
-- the adjustment marker also makes a manual re-execution a no-op for KLOW.
CREATE TABLE IF NOT EXISTS inventory_adjustments (
  adjustment_id TEXT PRIMARY KEY,
  code TEXT NOT NULL,
  quantity_delta INTEGER NOT NULL,
  applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT OR IGNORE INTO inventory (code, on_hand, reserved, sold, updated_at) VALUES
  ('GLP2-15', 4, 0, 0, CURRENT_TIMESTAMP),
  ('IPAMORELIN-10', 4, 0, 0, CURRENT_TIMESTAMP),
  ('SERMORELIN-5', 0, 0, 0, CURRENT_TIMESTAMP);

UPDATE inventory
SET on_hand = on_hand + 1,
    updated_at = CURRENT_TIMESTAMP
WHERE code = 'KLOW-80'
  AND NOT EXISTS (
    SELECT 1 FROM inventory_adjustments
    WHERE adjustment_id = 'protide-klow-add-one'
  );

INSERT OR IGNORE INTO inventory_adjustments (adjustment_id, code, quantity_delta)
VALUES ('protide-klow-add-one', 'KLOW-80', 1);
