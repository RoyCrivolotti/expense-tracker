export interface LargeSnapshotDetails {
  owner: string
  bytes: number
  limit: number
}

export interface IncompleteBackupDetails {
  owner: string
  /** The day (YYYY-MM-DD) whose backup never finished. */
  dateKey: string
}

export interface InconsistentBackupDetails {
  owner: string
  dateKey: string
  /** Which pass over the ledger was spoiled by a write. */
  attempt: number
  /** True when no pass is left, so the day has no backup for this owner. */
  final: boolean
}

export interface BucketLimitDetails {
  usedBytes: number
  limitBytes: number
}

/** Notifies operators when backup policy thresholds are crossed. */
export interface BackupAlerts {
  onLargeSnapshot(details: LargeSnapshotDetails): Promise<void>
  onBucketNearLimit(details: BucketLimitDetails): Promise<void>
  /** A chunked backup that was started and never finished before the next day's began. */
  onIncompleteBackup(details: IncompleteBackupDetails): Promise<void>
  /** The ledger was written to while a chunked backup was reading it, so the pass was thrown away. */
  onInconsistentBackup(details: InconsistentBackupDetails): Promise<void>
}
