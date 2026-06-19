import { describe, expect, it } from 'vitest'
import { resolveBackupPolicy } from './backupPolicy'

describe('resolveBackupPolicy', () => {
  it('uses config defaults when env overrides are absent', () => {
    expect(resolveBackupPolicy({})).toEqual({
      retentionDays: 14,
      maxBucketBytes: 536_870_912,
      maxSnapshotBytes: 5_242_880,
      bucketAlertThresholdFraction: 0.8,
    })
  })

  it('merges valid env overrides', () => {
    expect(
      resolveBackupPolicy({
        BACKUP_RETENTION_DAYS: '7',
        BACKUP_MAX_BUCKET_BYTES: '1048576',
        BACKUP_MAX_SNAPSHOT_BYTES: '2048',
        BACKUP_BUCKET_ALERT_FRACTION: '0.5',
      }),
    ).toEqual({
      retentionDays: 7,
      maxBucketBytes: 1_048_576,
      maxSnapshotBytes: 2048,
      bucketAlertThresholdFraction: 0.5,
    })
  })

  it('ignores invalid env overrides', () => {
    expect(
      resolveBackupPolicy({
        BACKUP_RETENTION_DAYS: 'nope',
        BACKUP_MAX_BUCKET_BYTES: '-1',
        BACKUP_BUCKET_ALERT_FRACTION: '2',
      }),
    ).toEqual({
      retentionDays: 14,
      maxBucketBytes: 536_870_912,
      maxSnapshotBytes: 5_242_880,
      bucketAlertThresholdFraction: 0.8,
    })
  })
})
