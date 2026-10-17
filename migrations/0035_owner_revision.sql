-- One opaque token per owner that changes whenever anything the owner's dataset is built from changes.
-- GET /api/expenses answers a conditional request with 304 when the token the browser holds is still
-- the current one, which costs one small read instead of loading every table (docs/SCALING.md).
--
-- The token is random and replaced on each write, not a counter: two owners can then never hold the
-- same value, and it says nothing about how many changes there have been. The API middleware replaces
-- it around every write request (docs/ARCHITECTURE.md, "Dataset revision").
--
-- No backfill: an owner with no row gets one the first time the dataset is read.
--
-- Apply this before the code that reads it is deployed: every write request replaces the token, so a
-- database without the table fails every write until it is there.
--
-- Applied by the deploy, which records it in _migrations (docs/DEPLOYMENT.md), or by hand with
--   npm run migrate -- <database> --apply
-- Running the file with wrangler on its own does not record it, and the next deploy then tries to create the table again.

CREATE TABLE IF NOT EXISTS owner_revision (
  owner TEXT PRIMARY KEY,
  token TEXT NOT NULL
);
