import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { adversarialLedger } from '../testing/adversarialLedger'
import { type FakeIndexedDb, installFakeIndexedDb } from '../testing/fakeIndexedDb'
import { makeAttachment } from '../testing/factories'
import { memorySource } from '../testing/ledgerSource'
import { type HeldLedger, holdParts, holdReceipts } from './ledgerHold'
import { readLedgerParts } from './ledgerLoader'
import {
  LEDGER_SNAPSHOT_FORMAT,
  isUsableLedgerSnapshot,
  loadLedgerSnapshot,
  saveLedgerSnapshot,
} from './ledgerSnapshot'
import { SNAPSHOT_VERSION } from './offlineCache'

let fake: FakeIndexedDb

beforeEach(() => {
  fake = installFakeIndexedDb()
})

afterEach(() => {
  fake.uninstall()
})

const WINDOWED = { fullBelowRows: 0, dataMonths: 13 }

async function held(): Promise<HeldLedger> {
  const base = holdParts(await readLedgerParts(memorySource(adversarialLedger()), { policy: WINDOWED }))
  const id = Number(Object.keys(base.attachmentCounts)[0])
  return holdReceipts(base, id, [makeAttachment({ id: 77, transactionId: id })])
}

const records = () => [...(fake.stores.get('snapshots')?.values() ?? [])] as Array<Record<string, unknown>>

describe('saveLedgerSnapshot and loadLedgerSnapshot', () => {
  it('give back what was saved, with its maps, the month it was showing and when it was saved', async () => {
    const saved = await held()
    expect(await saveLedgerSnapshot('alex@example.com', saved, '2026-03')).toBe(true)
    const loaded = await loadLedgerSnapshot('alex@example.com')
    expect(loaded!.held).toEqual(saved)
    expect(loaded!.held.rows).toBeInstanceOf(Map)
    expect(loaded!.held.receipts.get(Number(Object.keys(saved.attachmentCounts)[0]))![0]!.id).toBe(77)
    expect(loaded!.viewed).toBe('2026-03')
    expect(new Date(loaded!.savedAt).getTime()).toBeLessThanOrEqual(Date.now())
  })

  it('has nothing for an owner that never saved one', async () => {
    expect(await loadLedgerSnapshot('alex@example.com')).toBeNull()
  })

  it('keeps one record per owner and only the current owner’s', async () => {
    const saved = await held()
    await saveLedgerSnapshot('alex@example.com', saved, '2026-03')
    await saveLedgerSnapshot('sam@example.com', saved, '2026-04')
    expect(records().map((r) => r.key)).toEqual(['ledger:sam@example.com'])
    expect(await loadLedgerSnapshot('alex@example.com')).toBeNull()
    expect((await loadLedgerSnapshot('sam@example.com'))!.viewed).toBe('2026-04')
  })

  it('leaves the records of the older, whole-dataset snapshot alone', async () => {
    fake.stores.set('snapshots', new Map([['latest', { key: 'latest', version: SNAPSHOT_VERSION }]]))
    await saveLedgerSnapshot('alex@example.com', await held(), '2026-03')
    expect(records().map((r) => r.key).sort()).toEqual(['latest', 'ledger:alex@example.com'])
  })

  it('discards a snapshot written by a build that read the dataset differently, and removes it', async () => {
    await saveLedgerSnapshot('alex@example.com', await held(), '2026-03')
    records()[0]!.version = SNAPSHOT_VERSION - 1
    expect(await loadLedgerSnapshot('alex@example.com')).toBeNull()
    expect(records()).toEqual([])
  })

  it('discards a snapshot in another ledger format', async () => {
    await saveLedgerSnapshot('alex@example.com', await held(), '2026-03')
    records()[0]!.format = LEDGER_SNAPSHOT_FORMAT + 1
    expect(await loadLedgerSnapshot('alex@example.com')).toBeNull()
    expect(records()).toEqual([])
  })

  it('discards a record under this owner’s key that names someone else', async () => {
    await saveLedgerSnapshot('alex@example.com', await held(), '2026-03')
    records()[0]!.owner = 'sam@example.com'
    expect(await loadLedgerSnapshot('alex@example.com')).toBeNull()
    expect(records()).toEqual([])
  })

  it('discards a record that is not the shape of a snapshot', async () => {
    await saveLedgerSnapshot('alex@example.com', await held(), '2026-03')
    records()[0]!.ledger = { reference: {} }
    expect(await loadLedgerSnapshot('alex@example.com')).toBeNull()
  })

  it('never throws when it cannot write, so a load that worked is not turned into one that failed', async () => {
    fake.failNext('put')
    await expect(saveLedgerSnapshot('alex@example.com', await held(), '2026-03')).resolves.toBe(false)
    fake.failNext('getAllKeys')
    await expect(saveLedgerSnapshot('alex@example.com', await held(), '2026-03')).resolves.toBe(false)
  })

  it('has nothing to show when it cannot read, and does not throw', async () => {
    await saveLedgerSnapshot('alex@example.com', await held(), '2026-03')
    fake.failNext('get')
    await expect(loadLedgerSnapshot('alex@example.com')).resolves.toBeNull()
  })

  it('does nothing in a browser without IndexedDB', async () => {
    fake.uninstall()
    expect(await saveLedgerSnapshot('alex@example.com', await held(), '2026-03')).toBe(false)
    expect(await loadLedgerSnapshot('alex@example.com')).toBeNull()
  })
})

describe('isUsableLedgerSnapshot', () => {
  it('rejects what is not an object, and a missing record', () => {
    for (const value of [undefined, null, 'x', 3, []]) expect(isUsableLedgerSnapshot(value, 'alex@example.com')).toBe(false)
  })
})
