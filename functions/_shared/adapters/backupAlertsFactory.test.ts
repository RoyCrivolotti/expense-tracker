import { describe, expect, it, vi } from 'vitest'
import { createEmailBackupAlerts, consoleBackupAlerts } from './backupAlertsFactory'

describe('createEmailBackupAlerts', () => {
  it('forwards to inner alerts and sends email', async () => {
    const send = vi.fn().mockResolvedValue(undefined)
    const inner = {
      onLargeSnapshot: vi.fn().mockResolvedValue(undefined),
      onBucketNearLimit: vi.fn().mockResolvedValue(undefined),
      onIncompleteBackup: vi.fn().mockResolvedValue(undefined),
      onInconsistentBackup: vi.fn().mockResolvedValue(undefined),
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

  it('says a backup did not finish, naming the owner and the day', async () => {
    const send = vi.fn().mockResolvedValue(undefined)
    const alerts = createEmailBackupAlerts(consoleBackupAlerts, send)
    await alerts.onIncompleteBackup({ owner: 'a@b.com', dateKey: '2026-10-15' })
    expect(send).toHaveBeenCalledWith(
      expect.stringContaining('did not finish (a@b.com, 2026-10-15)'),
      expect.stringContaining('Day: 2026-10-15'),
    )
  })

  it('logs it when only the console is configured', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    await consoleBackupAlerts.onIncompleteBackup({ owner: 'a@b.com', dateKey: '2026-10-15' })
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('a@b.com backup for 2026-10-15 was started and never finished'))
    warn.mockRestore()
  })

  it('logs a pass that was thrown away, and emails only when no pass is left', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const send = vi.fn().mockResolvedValue(undefined)
    const alerts = createEmailBackupAlerts(consoleBackupAlerts, send)

    await alerts.onInconsistentBackup({ owner: 'a@b.com', dateKey: '2026-10-15', attempt: 1, final: false })
    expect(send).not.toHaveBeenCalled()
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('it is being started again'))

    await alerts.onInconsistentBackup({ owner: 'a@b.com', dateKey: '2026-10-15', attempt: 3, final: true })
    expect(send).toHaveBeenCalledWith(
      expect.stringContaining('No backup today'),
      expect.stringContaining('there is no backup of this owner for the day'),
    )
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('no pass is left'))
    warn.mockRestore()
  })
})
