-- Test fixture for the migration tooling (scripts/migrationTriggerChain.test.ts), not a migration of
-- this app. Two triggers that keep item_totals level with items. The first has a CASE ... END, a
-- semicolon in a string and a semicolon in a comment, which are what a split on every ";" would
-- cut it at.

CREATE TABLE IF NOT EXISTS item_log (note TEXT NOT NULL);

CREATE TRIGGER IF NOT EXISTS items_after_insert AFTER INSERT ON items
BEGIN
  -- one row per insert; the note says what was counted
  INSERT INTO item_log (note) VALUES ('counted; ' || NEW.kind);
  INSERT INTO item_totals (kind, n, cents) VALUES (NEW.kind, 1, NEW.cents)
    ON CONFLICT (kind) DO UPDATE SET n = n + 1, cents = cents + NEW.cents;
  UPDATE item_totals SET cents = CASE WHEN cents < 0 THEN 0 ELSE cents END WHERE kind = NEW.kind;
END;

CREATE TRIGGER IF NOT EXISTS items_after_delete AFTER DELETE ON items
BEGIN
  UPDATE item_totals SET n = n - 1, cents = cents - OLD.cents WHERE kind = OLD.kind;
END;
