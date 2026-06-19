import { describe, expect, it, vi } from 'vitest'
import { createBackupAlerts } from './createBackupAlerts'

describe('createBackupAlerts', () => {
  it('uses console-only alerts when email env is incomplete', async () => {
    const alerts = createBackupAlerts({ DB: {} as D1Database })
    await expect(
      alerts.onLargeSnapshot({ owner: 'a@b.com', bytes: 100, limit: 50 }),
    ).resolves.toBeUndefined()
  })

  it('wires email when binding and recipients are configured', async () => {
    const send = vi.fn().mockResolvedValue(undefined)
    const alerts = createBackupAlerts({
      DB: {} as D1Database,
      EMAIL: { send } as unknown as SendEmail,
      BACKUP_ALERT_TO: 'ops@example.com',
      BACKUP_ALERT_FROM: 'alerts@example.com',
      BACKUP_ALERT_FROM_NAME: 'Ops',
    })
    await alerts.onBucketNearLimit({ usedBytes: 900, limitBytes: 1000 })
    expect(send).toHaveBeenCalled()
  })
})
