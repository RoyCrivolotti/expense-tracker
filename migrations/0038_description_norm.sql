-- The normalized form of a transaction's description, stored beside it, so the server can answer
-- questions that group or search by description (the recurring series, autocomplete) with the same
-- text the app compares in the browser.
--
-- The app's normalization is JavaScript: trim, then toLowerCase, which is Unicode-aware and trims
-- every kind of whitespace. SQLite's lower() lowers ASCII letters only and its trim() strips spaces
-- only, so grouping or matching on lower(trim(description)) in SQL gives a different answer for
-- "CAFÉ" and for text with a tab or a no-break space around it. Every code path that writes a
-- description writes this column from the same JavaScript function (functions/_shared/dbWrite.ts,
-- dbInstallmentBackfill.ts), and a test fails if one stops.
--
-- NULL means "not computed yet", which is every existing row until the server has filled it in. The
-- code that reads the column fills a bounded chunk of NULL rows first and refuses to answer while
-- any remain (functions/_shared/descriptionNormBackfill.ts), so a half-filled table is never read as
-- if it were complete. Nothing here fills it, because SQL cannot produce the JavaScript result.
--
-- The one index, (owner, description_norm, date), serves three reads. A prefix search is a range of the
-- column within the owner, and the newest row of a description is the last entry of its range, so one
-- seek finds it; skipping from one description to the next is a seek too. The series read scans the
-- owner's range. The lookup for rows still waiting for a value uses the NULL entries, which sort first.
-- It costs one written row per inserted transaction, and one more whenever an UPDATE names description or
-- date in its SET list, changed or not (the edit form sends both every time), because SQLite rewrites the
-- index entry of every indexed column in the list. Cloudflare's Free plan allows 100,000 rows written a day.
-- Building the index writes one row per existing transaction, and filling an existing row writes two (the row
-- and its index entry), once, so a ledger of about 33,000 transactions uses a day's budget for both.
--
-- No owner-scoped statement here, so nothing to substitute before applying. Apply it before the code
-- that writes the column is deployed: the INSERT and UPDATE statements name it.
--
-- Applied by the deploy, which records it in _migrations (docs/DEPLOYMENT.md), or by hand with
--   npm run migrate -- <database> --apply

ALTER TABLE transactions ADD COLUMN description_norm TEXT;

CREATE INDEX IF NOT EXISTS idx_txn_owner_desc_norm ON transactions (owner, description_norm, date);
