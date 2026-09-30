-- Auto-label configuration for a flag: when set, the label is applied to every
-- transaction that carries this flag, both retroactively (at the moment this is
-- configured — see functions/_shared/dbFlags.ts's updateFlag) and going forward
-- (whenever a write assigns this flag to a transaction — see
-- functions/_shared/dbWrite.ts). Lets "Work travel" (a flag, which clears once
-- reimbursed) hand off to "Work trip — Madrid" (a label, which never clears on its
-- own) without doing it by hand for every claimed row.
--
-- Nullable: most flags have no auto-label. No enforced FK, same reasoning as
-- flag_id in 0015 and settled_by in 0018 — D1/SQLite's ALTER TABLE cannot add one.
-- Ownership is checked in app code (assertOwnedLabel) before every write. Deleting
-- a label clears any flag's auto_label_id pointing at it in the same operation
-- (see dbLabels.ts's deleteLabel), so this column cannot go stale.
--
-- Run as one batch:
--   npx wrangler d1 execute roy-expenses --remote --file=migrations/0029_flag_auto_label.sql

ALTER TABLE flags ADD COLUMN auto_label_id INTEGER;
