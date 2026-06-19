import type { BackupAlerts } from '@domain/ports/backupAlerts'
import {
  createEmailBackupAlerts,
  consoleBackupAlerts,
} from './backupAlertsFactory'
import { createCloudflareEmailSender } from './cloudflareEmailSender'
import type { Env } from '../env'

function parseRecipients(raw: string | undefined): string[] {
  if (!raw?.trim()) return []
  return [...new Set(raw.split(',').map((e) => e.trim().toLowerCase()).filter(Boolean))]
}

/** Console-only fallback when email is not configured. */
export function createBackupAlerts(env: Env): BackupAlerts {
  const recipients = parseRecipients(env.BACKUP_ALERT_TO)
  const fromAddress = env.BACKUP_ALERT_FROM?.trim()
  if (!env.EMAIL || recipients.length === 0 || !fromAddress) {
    return consoleBackupAlerts
  }

  const sender = createCloudflareEmailSender(env.EMAIL, {
    address: fromAddress,
    name: env.BACKUP_ALERT_FROM_NAME?.trim(),
  })

  return createEmailBackupAlerts(consoleBackupAlerts, async (subject, text) => {
    await sender.send({ to: recipients, subject, text })
  })
}
