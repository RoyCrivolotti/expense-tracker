import { createBackupDeps, runScheduledBackup } from '../../../functions/_shared/backupService'
import type { Env } from '../../../functions/_shared/env'

export default {
  async scheduled(_controller: ScheduledController, env: Env, _ctx: ExecutionContext) {
    const deps = createBackupDeps(env)
    if (!deps.store) {
      console.warn('backup: BACKUPS binding not configured — skipping')
      return
    }
    console.warn(await runScheduledBackup({ ...deps, store: deps.store }))
  },
}
