import type { Env } from './_shared/env'
import { createBackupDeps, runAllBackups } from './_shared/backupService'

/** Daily D1 snapshot to R2 (cron trigger configured on the Pages project). */
export const onSchedule: PagesFunction<Env> = async (context) => {
  const deps = createBackupDeps(context.env)
  if (!deps.store) {
    console.warn('backup: BACKUPS binding not configured — skipping')
    return new Response('skipped')
  }
  const result = await runAllBackups(deps)
  console.warn(
    `backup: wrote ${result.owners} owner(s) for ${result.dateKey}; pruned ${result.pruned}; ${result.usedBytes} bytes stored`,
  )
  return new Response('ok')
}
