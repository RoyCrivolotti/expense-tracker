import { describe, expect, it, vi } from 'vitest'
import type { UsagePart } from '../domain/data/ledgerParts'
import type { ExpenseDataset } from '../domain/types'
import { makeDataset, makeFlag, makeTransaction } from '../testing/factories'
import { LedgerUsage, touchesUsage } from './ledgerUsage'

const part = (revision: string, flagCount = 0): UsagePart => ({
  revision,
  categories: [],
  accounts: [],
  flags: [{ id: 1, transactions: flagCount }],
  labels: [],
})

/** A source whose reads a test lets through one at a time. */
function gated(...parts: Array<UsagePart | Error>) {
  const waiting: Array<() => void> = []
  const readUsagePart = vi.fn(
    () =>
      new Promise<UsagePart>((resolve, reject) => {
        const next = parts.shift() ?? part('end')
        waiting.push(() => (next instanceof Error ? reject(next) : resolve(next)))
      }),
  )
  return { readUsagePart, release: async () => { waiting.shift()?.(); await Promise.resolve(); await Promise.resolve() } }
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0))

describe('LedgerUsage', () => {
  it('reads nothing until a screen that shows the counts is on, and then reads them once', async () => {
    const source = { readUsagePart: vi.fn().mockResolvedValue(part('r1', 4)) }
    const usage = new LedgerUsage(source)
    await flush()
    expect(source.readUsagePart).not.toHaveBeenCalled()

    usage.watch()
    usage.watch()
    await flush()

    expect(source.readUsagePart).toHaveBeenCalledTimes(1)
    expect(usage.getState()).toMatchObject({ usage: part('r1', 4), loading: false, stale: false, error: null })
  })

  it('says it is reading while the first read is out, and has no counts yet rather than zeros', async () => {
    const source = gated(part('r1', 4))
    const usage = new LedgerUsage(source)
    usage.watch()
    expect(usage.getState()).toMatchObject({ usage: null, loading: true })

    await source.release()
    await flush()

    expect(usage.getState()).toMatchObject({ usage: part('r1', 4), loading: false })
  })

  it('does not read again for a screen that comes after, or for a write that could not change a count', async () => {
    const source = { readUsagePart: vi.fn().mockResolvedValue(part('r1')) }
    const usage = new LedgerUsage(source)
    const off = usage.watch()
    await flush()
    usage.noteWrite(false)
    off()
    usage.watch()
    await flush()
    expect(source.readUsagePart).toHaveBeenCalledTimes(1)
    expect(usage.getState().stale).toBe(false)
  })

  it('flags the counts as out of date after a write while no screen is on, and reads them when the next one comes', async () => {
    const source = { readUsagePart: vi.fn().mockResolvedValueOnce(part('r1', 1)).mockResolvedValueOnce(part('r2', 2)) }
    const usage = new LedgerUsage(source)
    usage.watch()()
    await flush()

    usage.noteWrite(true)
    expect(usage.getState()).toMatchObject({ stale: true, usage: part('r1', 1) })
    expect(source.readUsagePart).toHaveBeenCalledTimes(1)

    usage.watch()
    await flush()
    expect(usage.getState()).toMatchObject({ stale: false, usage: part('r2', 2) })
  })

  it('reads them again after a write that could change one while a screen is on', async () => {
    const source = { readUsagePart: vi.fn().mockResolvedValueOnce(part('r1', 1)).mockResolvedValueOnce(part('r2', 2)) }
    const usage = new LedgerUsage(source)
    usage.watch()
    await flush()

    usage.noteWrite(true)
    await flush()

    expect(source.readUsagePart).toHaveBeenCalledTimes(2)
    expect(usage.getState()).toMatchObject({ stale: false, usage: part('r2', 2) })
  })

  it('reads again when a write lands while it is reading, and says they are out of date if writes keep coming', async () => {
    const source = gated(part('r1'), part('r2'), part('r3'))
    const usage = new LedgerUsage(source)
    usage.watch()
    usage.noteWrite(true)
    await source.release()
    expect(source.readUsagePart).toHaveBeenCalledTimes(2)
    expect(usage.getState().stale).toBe(true)

    usage.noteWrite(true)
    await source.release()
    usage.noteWrite(true)
    await source.release()
    await flush()
    expect(source.readUsagePart).toHaveBeenCalledTimes(3)
    expect(usage.getState()).toMatchObject({ usage: part('r3'), stale: true, loading: false })
  })

  it('keeps the counts it had when a read fails, flags them, and tries again for the next screen or on request', async () => {
    const source = {
      readUsagePart: vi
        .fn()
        .mockResolvedValueOnce(part('r1', 1))
        .mockRejectedValueOnce(new Error('offline'))
        .mockResolvedValueOnce(part('r3', 3)),
    }
    const usage = new LedgerUsage(source)
    const off = usage.watch()
    await flush()
    usage.noteWrite(true)
    await flush()
    expect(usage.getState()).toMatchObject({ usage: part('r1', 1), error: 'offline', loading: false })

    off()
    usage.watch()
    await flush()
    expect(usage.getState()).toMatchObject({ usage: part('r3', 3), error: null, stale: false })
  })

  it('reads again for the next screen when a read that nothing overtook failed, though the counts are not out of date', async () => {
    const source = {
      readUsagePart: vi.fn().mockResolvedValueOnce(part('r1', 1)).mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(part('r1', 1)),
    }
    const usage = new LedgerUsage(source)
    const off = usage.watch()
    await flush()
    usage.refresh()
    await flush()
    expect(usage.getState()).toMatchObject({ usage: part('r1', 1), error: 'offline', stale: false })

    off()
    usage.watch()
    await flush()

    expect(source.readUsagePart).toHaveBeenCalledTimes(3)
    expect(usage.getState()).toMatchObject({ usage: part('r1', 1), error: null, stale: false })
  })

  it('has no counts and says why when the first read fails, and reads again on request', async () => {
    const source = { readUsagePart: vi.fn().mockRejectedValueOnce(new Error('down')).mockResolvedValueOnce(part('r1', 1)) }
    const usage = new LedgerUsage(source)
    usage.watch()
    await flush()
    expect(usage.getState()).toMatchObject({ usage: null, error: 'down' })

    usage.refresh()
    await flush()
    expect(usage.getState()).toMatchObject({ usage: part('r1', 1), error: null })
  })

  it('tells the screens when anything changes', async () => {
    const usage = new LedgerUsage({ readUsagePart: vi.fn().mockResolvedValue(part('r1')) })
    const heard = vi.fn()
    const off = usage.subscribe(heard)
    usage.watch()
    await flush()
    expect(heard).toHaveBeenCalled()
    off()
    heard.mockClear()
    usage.noteWrite(true)
    expect(heard).not.toHaveBeenCalled()
  })
})

describe('touchesUsage', () => {
  const dataset = (overrides: Partial<ExpenseDataset> = {}) =>
    makeDataset({
      categories: [{ id: 1, name: 'Food', monthlyBudgetCents: 0, sortOrder: 1, active: true }],
      accounts: [{ id: 1, name: 'Debit', kind: 'debit', settlement: 'immediate', active: true }],
      flags: [makeFlag({ id: 1 })],
      transactions: [makeTransaction({ id: 1 }), makeTransaction({ id: 2 })],
      ...overrides,
    })
  const write = (after: ExpenseDataset, extra: { beyond?: boolean; patch?: object } = {}) => ({
    before: dataset(),
    after,
    beyond: extra.beyond ?? false,
    reach: extra.patch === undefined && extra.beyond !== true ? undefined : ({ patch: extra.patch } as never),
  })

  it('is true when a write to rows that are held changes what names a record', () => {
    expect(touchesUsage(write(dataset({ transactions: [makeTransaction({ id: 1, flagId: 1 }), makeTransaction({ id: 2 })] })))).toBe(true)
    expect(touchesUsage(write(dataset({ transactions: [makeTransaction({ id: 1 })] })))).toBe(true)
    expect(touchesUsage(write(dataset({ flags: [] })))).toBe(true)
  })

  it('is false when it changes only what a count is not made of', () => {
    expect(touchesUsage(write(dataset({ transactions: [makeTransaction({ id: 1, description: 'renamed' }), makeTransaction({ id: 2 })] })))).toBe(false)
    expect(touchesUsage(write(dataset({ flags: [makeFlag({ id: 1, name: 'renamed' })] })))).toBe(false)
  })

  it('is true for a write that reached rows that are not held when it wrote a field the counts are made of, none, or added or removed rows', () => {
    for (const patch of [{ categoryId: 2 }, { accountId: 2 }, { flagId: 2 }, { labelIds: [1] }, {}, undefined]) {
      expect(touchesUsage(write(dataset(), { beyond: true, patch: patch as object })), JSON.stringify(patch)).toBe(true)
    }
  })

  it('is false for a write that reached rows that are not held and only wrote what a count is not made of', () => {
    expect(touchesUsage(write(dataset(), { beyond: true, patch: { description: 'renamed', date: '2026-01-02' } }))).toBe(false)
  })
})
