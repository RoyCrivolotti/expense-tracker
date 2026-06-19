import { describe, expect, it, vi } from 'vitest'
import { createEmailBackupAlerts, consoleBackupAlerts } from './backupAlertsFactory'

describe('createEmailBackupAlerts', () => {
  it('forwards to inner alerts and sends email', async () => {
    const send = vi.fn().mockResolvedValue(undefined)
    const inner = {
      onLargeSnapshot: vi.fn().mockResolvedValue(undefined),
      onBucketNearLimit: vi.fn().mockResolvedValue(undefined),
    }
    const alerts = createEmailBackupAlerts(inner, send)
    await alerts.onLargeSnapshot({ owner: 'a@b.com', bytes: 100, limit: 50 })
    expect(inner.onLargeSnapshot).toHaveBeenCalled()
    expect(send).toHaveBeenCalledWith(
      expect.stringContaining('Large backup snapshot'),
      expect.stringContaining('a@b.com'),
    )
  })

  it('sends bucket limit email', async () => {
    const send = vi.fn().mockResolvedValue(undefined)
    const alerts = createEmailBackupAlerts(consoleBackupAlerts, send)
    await alerts.onBucketNearLimit({ usedBytes: 900, limitBytes: 1000 })
    expect(send).toHaveBeenCalledWith(
      expect.stringContaining('nearing size cap'),
      expect.stringContaining('900'),
    )
  })
})
