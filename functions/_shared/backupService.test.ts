import { describe, expect, it, vi } from 'vitest'
import type { ExpenseRepository } from '@domain/ports/expenseRepository'
import type { BackupStore } from '@domain/ports/backupStore'
import type { BackupAlerts } from '@domain/ports/backupAlerts'
import { createBackupDeps, runAllBackups } from './backupService'

function mockRepo(overrides: Partial<ExpenseRepository> = {}): ExpenseRepository {
  return {
    loadDataset: vi.fn().mockResolvedValue({ categories: [], accounts: [], transactions: [] }),
    listOwners: vi.fn().mockResolvedValue(['a@b.com']),
    insertTransaction: vi.fn(),
    updateTransaction: vi.fn(),
    deleteTransaction: vi.fn(),
    deleteTransactions: vi.fn(),
    setStatementPaid: vi.fn(),
    setCashActual: vi.fn(),
    clearCashActual: vi.fn(),
    createCategory: vi.fn(),
    updateCategory: vi.fn(),
    createAccount: vi.fn(),
    updateAccount: vi.fn(),
    updateSettings: vi.fn(),
    updateGoals: vi.fn(),
    ...overrides,
  }
}

function mockStore(objects: { key: string; size: number }[] = []): BackupStore & {
  put: ReturnType<typeof vi.fn>
  list: ReturnType<typeof vi.fn>
} {
  let stored = [...objects]
  return {
    put: vi.fn().mockImplementation(async (key: string, body: string) => {
      stored = stored.filter((o) => o.key !== key)
      stored.push({ key, size: body.length })
    }),
    list: vi.fn().mockImplementation(async () => stored),
    delete: vi.fn().mockImplementation(async (key: string) => {
      stored = stored.filter((o) => o.key !== key)
    }),
  }
}

function mockAlerts(): BackupAlerts & {
  onLargeSnapshot: ReturnType<typeof vi.fn>
  onBucketNearLimit: ReturnType<typeof vi.fn>
} {
  return {
    onLargeSnapshot: vi.fn().mockResolvedValue(undefined),
    onBucketNearLimit: vi.fn().mockResolvedValue(undefined),
  }
}

const policy = {
  retentionDays: 14,
  maxBucketBytes: 500,
  maxSnapshotBytes: 10,
  bucketAlertThresholdFraction: 0.8,
}

describe('runAllBackups', () => {
  it('writes JSON via BackupStore when configured', async () => {
    const store = mockStore()
    await runAllBackups({ repo: mockRepo(), store, alerts: mockAlerts(), policy })
    expect(store.put).toHaveBeenCalledWith(
      expect.stringMatching(/^a@b\.com\/\d{4}-\d{2}-\d{2}\.json$/),
      expect.any(String),
    )
  })

  it('alerts when snapshot exceeds maxSnapshotBytes', async () => {
    const store = mockStore()
    const alerts = mockAlerts()
    await runAllBackups({
      repo: mockRepo({ loadDataset: vi.fn().mockResolvedValue({ big: 'x'.repeat(20) }) }),
      store,
      alerts,
      policy,
    })
    expect(alerts.onLargeSnapshot).toHaveBeenCalledWith(
      expect.objectContaining({ owner: 'a@b.com', bytes: expect.any(Number), limit: 10 }),
    )
  })

  it('alerts when bucket usage crosses threshold after prune', async () => {
    const today = new Date().toISOString().slice(0, 10)
    const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10)
    const store = mockStore([
      { key: `a@b.com/${yesterday}.json`, size: 450 },
      { key: `a@b.com/${today}.json`, size: 0 },
    ])
    const alerts = mockAlerts()
    await runAllBackups({ repo: mockRepo(), store, alerts, policy })
    expect(alerts.onBucketNearLimit).toHaveBeenCalledWith({
      usedBytes: expect.any(Number),
      limitBytes: 500,
    })
  })

  it('skips store work when binding absent', async () => {
    const result = await runAllBackups({
      repo: mockRepo(),
      store: null,
      alerts: mockAlerts(),
      policy,
    })
    expect(result.usedBytes).toBe(0)
  })
})

describe('createBackupDeps', () => {
  it('returns null store without BACKUPS binding', () => {
    const deps = createBackupDeps({ DB: {} as D1Database })
    expect(deps.store).toBeNull()
  })
})
