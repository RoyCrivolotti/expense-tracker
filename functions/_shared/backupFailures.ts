import type { BackupAlerts } from '../domain/ports/backupAlerts'

/** One owner whose backup threw. */
export interface OwnerFailure {
  owner: string
  error: unknown
}

const reasonOf = (error: unknown): string => (error instanceof Error ? error.message : String(error))

/**
 * Says which owners have no backup today, then throws so the invocation shows as failed. Called once the other owners
 * have been backed up: one ledger that cannot be read must not take the rest down with it, nor pass unnoticed.
 */
export async function reportFailedBackups(
  alerts: BackupAlerts,
  dateKey: string,
  ownerCount: number,
  failures: OwnerFailure[],
): Promise<void> {
  const [first] = failures
  if (!first) return
  for (const { owner, error } of failures) {
    try {
      await alerts.onBackupFailed({ owner, dateKey, reason: reasonOf(error) })
    } catch {
      // The failure below is what matters; an alert that could not be sent must not replace it.
    }
  }
  const named = failures.map(({ owner, error }) => `${owner} (${reasonOf(error)})`).join(', ')
  throw new Error(`backup: ${failures.length} of ${ownerCount} owner(s) have no backup for ${dateKey}: ${named}`, {
    cause: first.error,
  })
}
