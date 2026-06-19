import { createBackupDeps, runAllBackups } from '../../../functions/_shared/backupService'
import type { Env } from '../../../functions/_shared/env'

export default {
  async scheduled(_controller: ScheduledController, env: Env, _ctx: ExecutionContext) {
    const deps = createBackupDeps(env)
    if (!deps.store) {
      console.warn('backup: BACKUPS binding not configured — skipping')
      return
    }
    const result = await runAllBackups(deps)
    console.warn(
      `backup: wrote ${result.owners} owner(s) for ${result.dateKey}; pruned ${result.pruned}; ${result.usedBytes} bytes stored`,
    )
  },
}
