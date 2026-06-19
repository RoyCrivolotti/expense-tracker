export interface LargeSnapshotDetails {
  owner: string
  bytes: number
  limit: number
}

export interface BucketLimitDetails {
  usedBytes: number
  limitBytes: number
}

/** Notifies operators when backup policy thresholds are crossed. */
export interface BackupAlerts {
  onLargeSnapshot(details: LargeSnapshotDetails): Promise<void>
  onBucketNearLimit(details: BucketLimitDetails): Promise<void>
}
