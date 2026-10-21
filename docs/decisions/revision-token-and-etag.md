# One revision token per owner, and a weak ETag built from it

For an engineer deciding how clients learn nothing changed. Write-path rules: [ARCHITECTURE.md](../ARCHITECTURE.md).

**Context.** `GET /api/expenses` returns every table, and most opens find nothing changed. A conditional read needs a
check that is cheap and cannot say "unchanged" when something changed.

**Decision.** `owner_revision` (migration 0035) holds one random token per owner, and `functions/api/_middleware.ts`
replaces it before and after every request that is not a GET, HEAD or OPTIONS. The ETag is `W/"<token>-<budget
month>-<format>"`. It is weak because compression can re-encode a body without changing its meaning. The budget month is
in it because the installment backfill inserts rows when the month turns, and the format number so that a deploy that
changes the JSON shape never meets a browser holding the old shape under a matching tag. The tag is read before the
data, so a concurrent write leaves it older than the data and never newer.

**Consequences.**
- A match costs two rows read and runs no dataset query or backfill. Each write request costs two more rows written.
- The token is per owner, so any write invalidates every part and range.
- A new write route needs nothing. Anything that writes the dataset's tables outside the API must delete the owner's
  row, and `datasetRevision.integration.test.ts` fails for a write route with no test case.

**Not chosen.**
- A hash of the dataset: it reads everything first, which is what the check avoids.
- The newest `updated_at`: a delete changes no remaining row's timestamp, and not every table keeps one.
- A strong ETag: a re-encoded copy of the same body would stop matching.
- Bumping from each handler: a route that forgot would serve stale data until the owner's next write.
