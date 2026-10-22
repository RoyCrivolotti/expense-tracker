import { act, render, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { usageFromDataset } from '../domain/engine/recordUsage'
import { HYDRATED_DATA_MONTHS, type HydrationPolicy } from '../domain/ledger'
import { adversarialLedger } from '../testing/adversarialLedger'
import { type TestSource, memorySource } from '../testing/ledgerSource'
import { syntheticLedger } from '../testing/syntheticLedger'
import { patchAfterBulkUpdate } from './datasetPatches'
import { type UsageView, useRecordUsage } from './definitions/recordUsage'
import { type ExpenseData } from './useExpenseData'
import { useLedgerData } from './useLedgerData'

const WINDOWED: HydrationPolicy = { fullBelowRows: 0, dataMonths: HYDRATED_DATA_MONTHS }
const big = adversarialLedger()
const small = syntheticLedger({ months: 12, perMonth: 10, seed: 1 })

interface Sink {
  data: ExpenseData | null
  usage: UsageView | null
}

/** The data of a ledger and, under it, the counts a Settings screen would be given. */
function open(source: TestSource, policy?: HydrationPolicy) {
  const sink: Sink = { data: null, usage: null }
  function Counts({ data }: { data: ExpenseData }) {
    sink.usage = useRecordUsage(data.model!)
    return null
  }
  function Probe() {
    const data = useLedgerData(source, policy ? { policy } : undefined)
    sink.data = data
    return data.model ? <Counts data={data} /> : null
  }
  render(<Probe />)
  return sink
}

const ready = (sink: Sink) => waitFor(() => expect(sink.usage).not.toBeNull())
/** The first counts are in. */
const loaded = (sink: Sink) => waitFor(() => expect(sink.usage?.usage ?? null).not.toBeNull())
const counts = (sink: Sink) => {
  const { categories, accounts, flags, labels } = sink.usage!.usage!
  return { categories, accounts, flags, labels }
}

afterEach(() => {
  vi.useRealTimers()
})

describe('the counts of a window', () => {
  it('are the server’s, which are the whole ledger’s and not those of the rows held', async () => {
    const source = memorySource(big)
    const sink = open(source, WINDOWED)
    await loaded(sink)

    expect(counts(sink)).toEqual(usageFromDataset(big))
    expect(source.calls.filter((call) => call === 'usage')).toHaveLength(1)
    expect(sink.usage!.note).toBeNull()
    const own = usageFromDataset(sink.data!.model!.dataset)
    expect(own).not.toEqual(usageFromDataset(big))
  })

  it('say they are being read, with no numbers, until the first read is in', async () => {
    const source = memorySource(big)
    const read = source.readUsagePart.bind(source)
    let release = () => {}
    const gate = new Promise<void>((resolve) => (release = resolve))
    source.readUsagePart = async () => {
      await gate
      return read()
    }
    const sink = open(source, WINDOWED)
    await ready(sink)
    expect(sink.usage).toMatchObject({ usage: null, note: 'reading' })

    release()
    await waitFor(() => expect(sink.usage!.usage).not.toBeNull())
    expect(sink.usage!.note).toBeNull()
  })

  it('are read again after a write to rows that are not held, and follow it', async () => {
    const source = memorySource(big)
    const sink = open(source, WINDOWED)
    await loaded(sink)
    const held = new Set(sink.data!.model!.dataset.transactions.map((t) => t.id))
    const older = big.transactions.filter((t) => !held.has(t.id) && !t.planId && !t.settledBy).slice(0, 5)
    expect(older.length).toBeGreaterThan(0)
    const to = big.categories.find((c) => c.id !== older[0]!.categoryId)!
    const moved = older.map((t) => ({ ...t, categoryId: to.id }))
    source.dataset = { ...big, transactions: big.transactions.map((t) => moved.find((m) => m.id === t.id) ?? t) }
    const before = counts(sink)

    act(() => sink.data!.applyPatch((d) => patchAfterBulkUpdate(d, moved), { ids: older.map((t) => t.id), patch: { categoryId: to.id } }))

    await waitFor(() => expect(counts(sink)).toEqual(usageFromDataset(source.dataset)))
    expect(counts(sink)).not.toEqual(before)
    expect(sink.usage!.note).toBeNull()
  })

  it('are not read again for a write that cannot change one', async () => {
    const source = memorySource(big)
    const sink = open(source, WINDOWED)
    await loaded(sink)
    const held = sink.data!.model!.dataset.transactions.find((t) => !t.planId && !t.settledBy && !t.reportCount)!

    act(() => sink.data!.applyPatch((d) => patchAfterBulkUpdate(d, [{ ...held, description: 'Renamed' }]), { ids: [held.id], patch: { description: 'Renamed' } }))
    await new Promise((resolve) => setTimeout(resolve, 20))

    expect(source.calls.filter((call) => call === 'usage')).toHaveLength(1)
  })

  it('keep what was read and say so when a later read fails, and say nothing was read when the first does', async () => {
    const source = memorySource(big)
    const read = source.readUsagePart.bind(source)
    source.readUsagePart = vi.fn().mockRejectedValueOnce(new Error('down')).mockImplementation(read)
    const sink = open(source, WINDOWED)
    await waitFor(() => expect(sink.usage?.note).toBe('failed'))
    expect(sink.usage!.usage).toBeNull()

    act(() => sink.usage!.refresh())
    await waitFor(() => expect(sink.usage!.note).toBeNull())
    expect(counts(sink)).toEqual(usageFromDataset(big))

    source.readUsagePart = vi.fn().mockRejectedValue(new Error('down again'))
    const first = sink.data!.model!.dataset.transactions.find((t) => !t.planId && !t.settledBy && !t.reportCount)!
    act(() => sink.data!.applyPatch((d) => patchAfterBulkUpdate(d, [{ ...first, categoryId: first.categoryId === 1 ? 2 : 1 }]), { ids: [first.id], patch: { categoryId: 2 } }))
    await waitFor(() => expect(sink.usage!.note).toBe('failed'))
    expect(counts(sink)).toEqual(usageFromDataset(big))
  })

  it('say they may be out of date while the rows are at another revision than the counts, and ask once', async () => {
    const source = memorySource(big)
    const read = source.readUsagePart.bind(source)
    // The counts keep the revision they were first read at, as ones the server could not serve again would.
    let frozen = undefined as string | undefined
    source.readUsagePart = async () => ({ ...(await read()), revision: frozen ?? source.revision })
    const sink = open(source, WINDOWED)
    await loaded(sink)
    expect(sink.usage!.note).toBeNull()

    frozen = source.revision
    source.move('after-the-other-tab')
    act(() => sink.data!.reload())

    await waitFor(() => expect(sink.usage!.note).toBe('stale'))
    await new Promise((resolve) => setTimeout(resolve, 30))
    expect(source.calls.filter((call) => call === 'usage')).toHaveLength(2)
  })

  it('are read again when the rows are read at another revision than the counts, once', async () => {
    const source = memorySource(big)
    const sink = open(source, WINDOWED)
    await loaded(sink)
    expect(source.calls.filter((call) => call === 'usage')).toHaveLength(1)

    source.move('r-other-tab')
    act(() => sink.data!.reload())
    await waitFor(() => expect(source.calls.filter((call) => call === 'usage')).toHaveLength(2))
    await new Promise((resolve) => setTimeout(resolve, 30))
    expect(source.calls.filter((call) => call === 'usage')).toHaveLength(2)
    expect(sink.usage!.note).toBeNull()
  })
})

describe('the counts of a ledger held in full', () => {
  it('are its own rows’, certain, and nothing is asked of the server', async () => {
    const source = memorySource(small)
    const sink = open(source)
    await waitFor(() => expect(sink.usage).not.toBeNull())

    expect(counts(sink)).toEqual(usageFromDataset(small))
    expect(sink.usage!.note).toBeNull()
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(source.calls).not.toContain('usage')
  })
})
