# The resumable backup redoes a pass rather than hold a snapshot

For an engineer changing how backups are taken. The runbook is in [BACKUPS.md](../BACKUPS.md), the invariants in
[ARCHITECTURE.md](../ARCHITECTURE.md).

**Context.** The single-file snapshot loads and serialises a whole ledger in one invocation, which the Free plan's CPU
and subrequest limits would stop allowing as the ledger grows, if enforced as documented ([SCALING.md](../SCALING.md)).
A backup then spans several invocations, and D1 has no read transaction across them, so a restore can mix two moments
and fail on a reference (a transaction whose category was deleted in between).

**Decision.** The backup walks the export a bounded number of calls and rows at a time, writes parts, and saves its place.
It takes the owner's revision token when it starts and again before it finishes, and writes the manifest only if the
token is unchanged. If it moved, the pass is thrown away and started again, up to three times in a day. A backup exists
when its manifest does. The mode is off unless `BACKUP_MODE` is `chunked`, because every merge redeploys the worker.

**Consequences.**
- A kill at any point leaves a run the next invocation continues, and never a manifest over missing parts.
- A ledger written to all day may have no backup for the day. The alert says so, and the previous day's stands.
- A backup is as consistent as the revision token. A write made straight to D1, which does not bump it, is not caught.

**Not chosen.**
- Copy as it goes and accept rows from different moments: it fails on the restore, which is the worst time to find out.
- Block writes while the backup runs: the app must stay usable, and a backup that fails would hold writes for as long as
  it keeps failing.
- A queue or Durable Object to drive the walk: more to deploy for a job a repeating cron trigger and a state file already
  cover.
