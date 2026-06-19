import type { ExpenseRepository } from '@domain/ports/expenseRepository'

export interface Env {
  DB: D1Database
  BACKUPS?: R2Bucket
  /** Cloudflare Email Sending binding (optional). */
  EMAIL?: SendEmail
  ALLOWED_EMAILS?: string
  BACKUP_RETENTION_DAYS?: string
  BACKUP_MAX_BUCKET_BYTES?: string
  BACKUP_MAX_SNAPSHOT_BYTES?: string
  BACKUP_BUCKET_ALERT_FRACTION?: string
  /** Comma-separated alert recipients (synced from config/backup-alerts.json). */
  BACKUP_ALERT_TO?: string
  /** Verified sender address on your domain (must match Email Sending setup). */
  BACKUP_ALERT_FROM?: string
  BACKUP_ALERT_FROM_NAME?: string
}

/**
 * Per-request data the auth middleware attaches to `context.data`. `owner` is
 * the authenticated, lowercased email; every read and write is scoped to it so
 * each user only ever sees their own tracker (row-level multi-tenancy).
 */
export interface ExpensesData extends Record<string, unknown> {
  owner: string
  repo: ExpenseRepository
}
