import type {
  BackupAlerts,
  BucketLimitDetails,
  IncompleteBackupDetails,
  InconsistentBackupDetails,
  LargeSnapshotDetails,
} from '../../domain/ports/backupAlerts'

/** Logs backup alert events to the Worker/Pages Function log stream. */
export const consoleBackupAlerts: BackupAlerts = {
  onLargeSnapshot({ owner, bytes, limit }: LargeSnapshotDetails) {
    console.warn(`backup: ${owner} snapshot ${bytes} bytes exceeds maxSnapshotBytes ${limit}`)
    return Promise.resolve()
  },
  onBucketNearLimit({ usedBytes, limitBytes }: BucketLimitDetails) {
    const pct = Math.round((usedBytes / limitBytes) * 100)
    console.warn(`backup: bucket at ${usedBytes} bytes (${pct}% of ${limitBytes} byte cap)`)
    return Promise.resolve()
  },
  onInconsistentBackup({ owner, dateKey, attempt, final }: InconsistentBackupDetails) {
    const next = final ? 'no pass is left, so there is no backup of it today' : 'it is being started again'
    console.warn(`backup: ${owner} ledger changed during pass ${attempt} of the backup for ${dateKey}; ${next}`)
    return Promise.resolve()
  },
  onIncompleteBackup({ owner, dateKey }: IncompleteBackupDetails) {
    console.warn(`backup: ${owner} backup for ${dateKey} was started and never finished`)
    return Promise.resolve()
  },
}

function formatLargeSnapshot({ owner, bytes, limit }: LargeSnapshotDetails): string {
  return [
    'Expense tracker backup alert: large snapshot',
    `Owner: ${owner}`,
    `Size: ${bytes} bytes (limit ${limit} bytes)`,
  ].join('\n')
}

function formatBucketLimit({ usedBytes, limitBytes }: BucketLimitDetails): string {
  const pct = Math.round((usedBytes / limitBytes) * 100)
  return [
    'Expense tracker backup alert: bucket nearing size cap',
    `Used: ${usedBytes} bytes (${pct}% of ${limitBytes} byte cap)`,
  ].join('\n')
}

function formatIncomplete({ owner, dateKey }: IncompleteBackupDetails): string {
  return [
    'Expense tracker backup alert: a backup did not finish',
    `Owner: ${owner}`,
    `Day: ${dateKey}`,
    'The last complete backup is the one before it. Check that the worker has the extra cron triggers that chunked mode needs (docs/DEPLOYMENT.md).',
  ].join('\n')
}

function formatInconsistent({ owner, dateKey, attempt, final }: InconsistentBackupDetails): string {
  return [
    'Expense tracker backup alert: the ledger changed during a backup',
    `Owner: ${owner}`,
    `Day: ${dateKey}`,
    `Pass: ${attempt}`,
    final
      ? 'No pass is left today, so there is no backup of this owner for the day. The last complete backup is the one before it.'
      : 'The pass was thrown away and the backup starts again.',
  ].join('\n')
}

/** Email + console composite; skips email when recipients or sender are unavailable. */
export function createEmailBackupAlerts(
  inner: BackupAlerts,
  sendEmail: (subject: string, text: string) => Promise<void>,
): BackupAlerts {
  return {
    async onLargeSnapshot(details) {
      await inner.onLargeSnapshot(details)
      await sendEmail(
        `[expense-tracker] Large backup snapshot (${details.owner})`,
        formatLargeSnapshot(details),
      )
    },
    async onBucketNearLimit(details) {
      await inner.onBucketNearLimit(details)
      await sendEmail('[expense-tracker] Backup bucket nearing size cap', formatBucketLimit(details))
    },
    async onInconsistentBackup(details) {
      await inner.onInconsistentBackup(details)
      if (!details.final) return
      await sendEmail(
        `[expense-tracker] No backup today: the ledger kept changing (${details.owner}, ${details.dateKey})`,
        formatInconsistent(details),
      )
    },
    async onIncompleteBackup(details) {
      await inner.onIncompleteBackup(details)
      await sendEmail(
        `[expense-tracker] A backup did not finish (${details.owner}, ${details.dateKey})`,
        formatIncomplete(details),
      )
    },
  }
}
