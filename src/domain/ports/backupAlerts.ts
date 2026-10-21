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
}
