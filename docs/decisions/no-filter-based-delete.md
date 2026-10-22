# Delete takes explicit ids, never a filter

For an engineer adding a bulk write. The route is in [API.md](../API.md).

**Context.** Once a browser holds only some months, "everything that matches" can include rows it never loaded, so a
server-side set is the natural way to name them, and a bulk edit can take a filter. That edit is guarded: it carries the
count and revision the user was shown, and its batch fails unless exactly the rows that were read still match. A wrong
edit can be edited back, but a wrong delete can only be undone by a D1 Time Travel restore, which discards every write
since.

**Decision.** `DELETE /transactions/bulk` takes an explicit `ids` array of at most 500 and nothing else, and no route
deletes by filter. The client names the rows it means, and the server deletes those, for the owner in the session.

**Consequences.**
- More than 500 rows take several requests, and the client has to hold or page the ids it wants gone.
- What the person confirmed is what is deleted, with no dependence on what a filter matches by the time the request lands.
- The route removes the receipt files of those ids from R2 first, then deletes the rows in one batch.

**Not chosen.**
- Delete by filter with the edit's guard: it would refuse a changed set, but the receipt files go before the batch and
  nothing can bring them back if the guard then refuses the rows.
- Delete by filter without a guard: the set can change between confirmation and request, and the result cannot be taken
  back.
