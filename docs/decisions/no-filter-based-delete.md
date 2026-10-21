# Delete takes explicit ids, never a filter

For an engineer adding a bulk write. The route is in [API.md](../API.md).

**Context.** Once a browser holds only some months, "everything that matches" can include rows it never loaded, so a
server-side set is the natural way to name them. An edit can be edited back, but a wrong delete can only be undone by a
D1 Time Travel restore, which discards every write since.

**Decision.** `DELETE /transactions/bulk` takes an explicit `ids` array of at most 500 and nothing else, and no route
deletes by filter. The client names the rows it means, and the server deletes those, for the owner in the session.

**Consequences.**
- More than 500 rows take several requests, and the client has to hold or page the ids it wants gone.
- What the person confirmed is what is deleted. The rows a filter matches can change between the look and the request
  (another tab, an import, the installment backfill), and an id list cannot.
- The route removes the receipt files of exactly those ids first, then deletes the rows in one batch.

**Not chosen.**
- Delete by filter: the set can change between confirmation and request, and the result cannot be taken back.
- Delete by filter with an expected count: it catches a changed count but not a changed set of the same size.
