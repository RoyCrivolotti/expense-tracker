# Store the normalized description

For an engineer deciding how descriptions are grouped and searched. Route facts: [API.md](../API.md).

**Context.** The app groups and compares descriptions with `normalizeDesc`: JavaScript's `trim()` then `toLowerCase()`,
which is Unicode-aware. SQLite's `lower` changes ASCII only and its `trim` strips only spaces. The series and
autocomplete routes group and search by description on the server and must agree with the browser.

**Decision.** `transactions.description_norm` (migration 0038) holds the JavaScript result, and every statement that
writes a description writes it too. An index on `(owner, description_norm, date)` serves grouping, prefix search and
"newest row of this description". Existing rows start NULL because SQL cannot compute the value. `fillDescriptionNorm`
fills them in bounded chunks, and a route that groups by the column answers 503 with `Retry-After` until none wait.

**Consequences.**
- Every writer of a description has to set the column. `descriptionNormWrites.test.ts` fails for a statement in
  `functions/`, `scripts/` or a later migration that does not.
- The index costs one written row per insert, and one more when a description or date is updated.
- Rolling the code back leaves stale values for rows edited meanwhile. The repair is in
  [DEPLOYMENT.md](../DEPLOYMENT.md).

**Not chosen.**
- Grouping on `lower(trim(description))` in SQL: it splits "CAFÉ" from "café" and keeps a tab as part of the word.
- SQL for ASCII rows and JavaScript for the rest: the Kelvin sign lowercases to an ASCII `k`, so a series would have
  rows in both sets, and a prefix search would need two paths.
- Computing the key in the Worker on every read: it normalizes every description of the owner on each request.
