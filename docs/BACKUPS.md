# Backups — expense-tracker

For an operator who runs the daily backup of a ledger, wants the resumable form for a ledger too big for one
invocation, or has to restore. The schedule, bucket and retention policy are in
[DEPLOYMENT.md](./DEPLOYMENT.md#scheduled-backups-r2).

## Two forms

- **Single-file snapshot** (the default): the whole dataset as JSON at `{owner-email}/{YYYY-MM-DD}.json`, written by one
  invocation. It loads and serialises everything at once, so it is expected to stop fitting in a Worker invocation as
  the ledger grows ([SCALING.md](./SCALING.md)).
- **Resumable backup**: a folder `{owner-email}/{YYYY-MM-DD}/` of `part-NNNNNN.ndjson` files, each line `{"t": table,
  "r": row}` in the shape of the [export](./API.md), a `state.json` while it runs, and a `manifest.json` written last.
  A folder without a manifest is not a backup. The retention policy keeps or drops a folder as a whole.

## Turning on the resumable form

It runs only when `BACKUP_MODE` is exactly `chunked`; unset, or any other value, keeps the single-file snapshot. An
invocation makes at most `BACKUP_STEP_MAX_OPERATIONS` D1 and bucket calls (default 44, allowed 12 to 46, under the Free
plan's 50 subrequests) and reads at most `BACKUP_STEP_MAX_ROWS` rows (default 1,500), then saves where it got to. The
next invocation carries on, so the worker needs a trigger that fires several times. In the same commit, in
`workers/backup-cron/wrangler.toml`:

```toml
[triggers]
crons = ["*/10 4-6 * * *"]

[vars]
BACKUP_MODE = "chunked"
```

Once every owner has a manifest for the day, the later runs only list the bucket. The defaults are cautious guesses
about what a Free-plan invocation allows; raise them only after watching a run in the worker's logs. Do not add the
frequent trigger without the mode (it would rewrite the single-file snapshot every ten minutes), and do not set the mode
without it (a ledger that does not finish in one invocation would never finish).

If the ledger is written to during a pass, the pass is thrown away and started again, and the owner is alerted. After
three passes there is no backup of that owner for the day and an alert says so; the previous day's stands. A run left
unfinished from an earlier day is reported once. To go back, remove `BACKUP_MODE` and put the trigger back to
`0 4 * * *`; unfinished folders are pruned with the rest, and a restore still reads both forms.

**A merge does not always deploy the worker.** The `ship` job runs `scripts/deploy-backup-cron.mjs` on every merge to
`main`. If `CLOUDFLARE_API_TOKEN` lacks Workers Scripts Edit, the script prints "skipped in CI" and exits 0, so the job
stays green and the worker keeps its old code and settings. After changing either, check the deployed version under
Workers & Pages, `expense-backup-cron`, Deployments, or run `npm run deploy:backup-cron` with a token that has the
scope.

## When a backup fails

An owner whose backup throws does not stop the others. Everyone else is backed up, old backups are pruned and the bucket
is measured, then the failed owners are alerted by name and the invocation fails, so the cron run shows as failed. In
chunked mode that clean-up waits until no owner is still waiting for a later run, and a failure that persists is alerted
on every run of the window (up to 24 a day, and one email each), because each run tries the owner again. The bucket
alert is raised on the size before pruning, since after it the bucket is under its cap by definition. Pruning
always keeps the newest complete backup of each owner who still has data, however old and even when the bucket is over
its cap, so a ledger that fails for weeks is not left with none. The backups of someone revoked and purged are not
kept and age out with the rest.

## Restoring

Restoring only produces SQL. `scripts/restore-backup.ts` reads files, never a database or the bucket, so the statements
can be read before anything applies them.

1. Download the backup. For a resumable one, the manifest and every part it lists, to the same paths under `backup/`:
   `npx wrangler r2 object get <bucket>/<owner>/<date>/manifest.json --file backup/<owner>/<date>/manifest.json`. For a
   single-file snapshot, `<owner>/<date>.json` to `backup/<owner>/<date>.json`.
2. `npm run restore:backup -- --dir backup --owner <owner> --date <YYYY-MM-DD> --out restore.sql`. A resumable backup
   is checked against the manifest's part sizes and row counts, and a missing or short part stops it. `--as <email>`
   restores the rows under another owner.
3. Apply the file to a new, empty D1 database that has every migration:
   `npx wrangler d1 execute <new-database> --remote --file=restore.sql`. Never apply it to the live database: the rows
   keep their ids and would collide with what is there. Check the result before switching the app's D1 binding to it.

The statements insert in dependency order, and applying them stops at the first row that refers to something absent,
because D1 enforces foreign keys. Receipt files are not in a backup (only R2 holds them): each attachment row comes
back with a key that names nothing, under `restored/`. Timestamps the app never shows (when a label or scenario was
created) start again, and instalments that fell due after the backup are created the next time the ledger is read.

To undo recent writes to the live database, use D1 Time Travel
([DEPLOYMENT.md](./DEPLOYMENT.md#if-a-migration-goes-wrong)). A backup is for a database that is gone, or older than
Time Travel reaches.
