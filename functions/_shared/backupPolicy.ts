import defaults from '@config/backup-policy.json'
import type { Env } from './env'

/** Tunable limits for R2 JSON backups — defaults in config/backup-policy.json. */
export interface BackupPolicy {
  retentionDays: number
  maxBucketBytes: number
  maxSnapshotBytes: number
  /** Alert when total stored bytes exceed this fraction of maxBucketBytes (0–1). */
  bucketAlertThresholdFraction: number
}

const BASE: BackupPolicy = {
  retentionDays: defaults.retentionDays,
  maxBucketBytes: defaults.maxBucketBytes,
  maxSnapshotBytes: defaults.maxSnapshotBytes,
  bucketAlertThresholdFraction: defaults.bucketAlertThresholdFraction,
}

function parsePositiveInt(raw: string | undefined, fallback: number): number {
  if (!raw?.trim()) return fallback
  const n = Number.parseInt(raw, 10)
  return Number.isFinite(n) && n > 0 ? n : fallback
}

function parseFraction(raw: string | undefined, fallback: number): number {
  if (!raw?.trim()) return fallback
  const n = Number.parseFloat(raw)
  return Number.isFinite(n) && n > 0 && n <= 1 ? n : fallback
}

/** Merge committed defaults with optional Pages env var overrides. */
export function resolveBackupPolicy(
  env: Pick<
    Env,
    | 'BACKUP_RETENTION_DAYS'
    | 'BACKUP_MAX_BUCKET_BYTES'
    | 'BACKUP_MAX_SNAPSHOT_BYTES'
    | 'BACKUP_BUCKET_ALERT_FRACTION'
  >,
): BackupPolicy {
  return {
    retentionDays: parsePositiveInt(env.BACKUP_RETENTION_DAYS, BASE.retentionDays),
    maxBucketBytes: parsePositiveInt(env.BACKUP_MAX_BUCKET_BYTES, BASE.maxBucketBytes),
    maxSnapshotBytes: parsePositiveInt(env.BACKUP_MAX_SNAPSHOT_BYTES, BASE.maxSnapshotBytes),
    bucketAlertThresholdFraction: parseFraction(
      env.BACKUP_BUCKET_ALERT_FRACTION,
      BASE.bucketAlertThresholdFraction,
    ),
  }
}
