import { describe, expect, it } from 'vitest'
import { HYDRATED_DATA_MONTHS, type HydrationPolicy } from '../domain/ledger'
import { sortedMonths } from '../domain/engine/dates'
import type { Transaction } from '../domain/types'
import { patchAfterLabel, patchAfterLabelDelete, patchAfterTransactionCreate } from '../ui/datasetPatches'
import { adversarialLedger } from '../testing/adversarialLedger'
import { makeTransaction } from '../testing/factories'
import { memorySource, type TestSource } from '../testing/ledgerSource'
import { syntheticLedger } from '../testing/syntheticLedger'
import { LedgerSession } from './ledgerSession'

/**
 * A ledger held open keeps knowing its revision across the writes its own user makes, when the server's receipts
 * (`before`, `after`) follow on from it; the month read next then needs no read of everything. The source's
 * revision is moved as the server would, twice for a write, and the receipt says what the server said.
 */
const WINDOWED: HydrationPolicy = { fullBelowRows: 0, dataMonths: HYDRATED_DATA_MONTHS }
const dataset = adversarialLedger()
const months = sortedMonths(dataset.transactions.map((t) => t.budgetMonth))
const newest = months.at(-1)!
const far = months[10]!

const calls = (source: TestSource, prefix: string) => source.calls.filter((c) => c.startsWith(prefix))
const flush = () => new Promise((resolve) => setTimeout(resolve, 5))

const row = (id: number, month: string): Transaction =>
  makeTransaction({ id, date: `${month}-12`, budgetMonth: month, description: `New ${id}` })

async function opened() {
  const source = memorySource(dataset)
  const session = new LedgerSession(source, { policy: WINDOWED })
  await session.open()
  return { source, session }
}

/**
 * A write to the reference tables as the browser sees it: the server moves to `after`, the receipt arrives, then the
 * patch. It moves no month's sums, so nothing is read after it that could give the held ledger a revision.
 */
function rename(source: TestSource, session: LedgerSession, receipt: { before: string | null; after: string | null }) {
  source.move(receipt.after ?? 'elsewhere')
  session.noteReceipt(receipt)
  const label = source.dataset.labels[0]!
  return session.patch((d) => patchAfterLabel(d, { ...label, name: `${label.name}!` }))
}

/** The same for a row added to `month`, which moves that month's sums, so they are read after it. */
function write(source: TestSource, session: LedgerSession, id: number, receipt: { before: string | null; after: string | null }, month = newest) {
  const added = row(id, month)
  source.dataset = { ...source.dataset, transactions: [...source.dataset.transactions, added] }
  source.move(receipt.after ?? 'elsewhere')
  session.noteReceipt(receipt)
  return session.patch((d) => patchAfterTransactionCreate(d, added))
}

describe('a month read after a write the server vouched for', () => {
  it('is read on its own, not with everything else', async () => {
    const { source, session } = await opened()
    rename(source, session, { before: 'r0', after: 'r2' })
    source.calls.length = 0

    await session.view(far)

    expect(calls(source, 'reference')).toEqual([])
    expect(calls(source, 'cube')).toEqual([])
    expect(calls(source, 'months:').length).toBeGreaterThan(0)
    expect(session.getState().held!.rows.has(far)).toBe(true)
  })

  it('leaves the revision the held ledger carries unknown, which the series and the counts read as "not compared"', async () => {
    const { source, session } = await opened()
    rename(source, session, { before: 'r0', after: 'r2' })

    await session.view(far)

    expect(session.getState().held!.revision).toBeNull()
  })

  it('goes on across writes that follow on from one another', async () => {
    const { source, session } = await opened()
    rename(source, session, { before: 'r0', after: 'r2' })
    rename(source, session, { before: 'r2', after: 'r4' })
    source.calls.length = 0

    await session.view(far)

    expect(calls(source, 'reference')).toEqual([])
  })

  it('is vouched for by the last of several writes that one patch shows, as a bulk edit in chunks is', async () => {
    const { source, session } = await opened()
    source.move('r6')
    session.noteReceipt({ before: 'r0', after: 'r2' })
    session.noteReceipt({ before: 'r2', after: 'r4' })
    session.noteReceipt({ before: 'r4', after: 'r6' })
    const label = source.dataset.labels[0]!
    session.patch((d) => patchAfterLabel(d, { ...label, name: 'Renamed' }))
    source.calls.length = 0

    await session.view(far)

    expect(calls(source, 'reference')).toEqual([])
  })

  it('also follows a write that changed nothing here, which the server counted all the same', async () => {
    const { source, session } = await opened()
    source.move('r2')
    session.noteReceipt({ before: 'r0', after: 'r2' })
    session.patch((d) => d)
    source.calls.length = 0

    await session.view(far)

    expect(calls(source, 'reference')).toEqual([])
    expect(session.getState().held!.rows.has(far)).toBe(true)
  })
})

describe('a month read after a write the server did not vouch for', () => {
  const refreshes = async (arrange: (source: TestSource, session: LedgerSession) => void) => {
    const { source, session } = await opened()
    arrange(source, session)
    source.calls.length = 0
    await session.view(far)
    return { source, session, refreshed: calls(source, 'reference').length > 0 }
  }

  it('reads everything when no receipt came, as for a source that sends none', async () => {
    const { refreshed } = await refreshes((source, session) => {
      source.move('r2')
      const label = source.dataset.labels[0]!
      session.patch((d) => patchAfterLabel(d, { ...label, name: 'Renamed' }))
    })
    expect(refreshed).toBe(true)
  })

  it('reads everything when the receipt does not start where the ledger was: another write came first', async () => {
    const { refreshed } = await refreshes((source, session) => rename(source, session, { before: 'rX', after: 'r2' }))
    expect(refreshed).toBe(true)
  })

  it('reads everything when the server left out the new token: another write ran between its two bumps', async () => {
    const { refreshed } = await refreshes((source, session) => rename(source, session, { before: 'r0', after: null }))
    expect(refreshed).toBe(true)
  })

  it('reads everything when the first token is missing, since "none" is not a revision to match', async () => {
    const { refreshed } = await refreshes((source, session) => rename(source, session, { before: null, after: 'r2' }))
    expect(refreshed).toBe(true)
  })

  it('reads everything when a later write does not follow on from the one before', async () => {
    const { refreshed } = await refreshes((source, session) => {
      rename(source, session, { before: 'r0', after: 'r2' })
      rename(source, session, { before: 'r3', after: 'r4' })
    })
    expect(refreshed).toBe(true)
  })

  it('reads everything when a write in the chain is missing between two that are there', async () => {
    const { refreshed } = await refreshes((source, session) => {
      source.move('r6')
      session.noteReceipt({ before: 'r0', after: 'r2' })
      session.noteReceipt({ before: 'r4', after: 'r6' })
      const label = source.dataset.labels[0]!
      session.patch((d) => patchAfterLabel(d, { ...label, name: 'Renamed' }))
    })
    expect(refreshed).toBe(true)
  })

  it('reads everything when someone else wrote after the browser did, since the rows held lack that', async () => {
    const { refreshed, session, source } = await refreshes((source, session) => {
      rename(source, session, { before: 'r0', after: 'r2' })
      source.move('r9')
    })
    expect(refreshed).toBe(true)
    expect(session.getState().held!.revision).toBe(source.revision)
  })

  it('reads everything when a receipt arrived with no patch to go with it, then a patch that does not match it', async () => {
    const { refreshed } = await refreshes((source, session) => {
      source.move('r2')
      session.noteReceipt({ before: 'r0', after: 'r2' })
      source.move('r4')
      session.noteReceipt({ before: 'r2', after: 'r4' })
      rename(source, session, { before: 'r9', after: 'r10' })
    })
    expect(refreshed).toBe(true)
  })

  it('reads everything when more writes were told of than a user makes between two patches', async () => {
    const { refreshed } = await refreshes((source, session) => {
      let at = 'r0'
      for (let i = 1; i <= 70; i++) {
        session.noteReceipt({ before: at, after: `r${i}` })
        at = `r${i}`
      }
      source.move(at)
      const label = source.dataset.labels[0]!
      session.patch((d) => patchAfterLabel(d, { ...label, name: 'Renamed' }))
    })
    expect(refreshed).toBe(true)
  })

  it('reads everything after a write the server answered with more than the patch shows', async () => {
    const { source, session } = await opened()
    const label = source.dataset.labels[0]!
    source.move('r2')
    session.noteReceipt({ before: 'r0', after: 'r2' })
    session.patch((d) => patchAfterLabelDelete(d, label.id))
    await flush()

    // The read the cascade started has settled the revision, so this month is read on its own again.
    expect(session.getState().held!.revision).toBe('r2')
    source.calls.length = 0
    await session.view(far)
    expect(calls(source, 'reference')).toEqual([])
  })

  it('does not read a month on its own while the read a cascade started is on its way, which would drop it', async () => {
    const { source, session } = await opened()
    const label = source.dataset.labels[0]!
    source.move('r2')
    session.noteReceipt({ before: 'r0', after: 'r2' })
    session.patch((d) => patchAfterLabelDelete(d, label.id))

    // The cascade's read began around the month shown before this one, and replaces the rows held when it lands.
    await session.view(far)
    await flush()

    expect(session.getState().held!.rows.has(far)).toBe(true)
  })

  it('does not let a receipt carry over a refresh the user asked for', async () => {
    const { source, session } = await opened()
    rename(source, session, { before: 'r0', after: 'r2' })
    await session.refresh()
    expect(session.getState().held!.revision).toBe('r2')
    source.move('r5')
    source.calls.length = 0

    await session.view(far)

    // The held revision is r2 and the month comes back under r5: a read of everything, not a mix.
    expect(calls(source, 'reference').length).toBeGreaterThan(0)
  })
})

describe('the sums of a month a write moved, read after it', () => {
  it('become the held ledger’s own revision when they were read at the one the writes left it at', async () => {
    const { source, session } = await opened()
    write(source, session, 900_001, { before: 'r0', after: 'r2' }, far)
    await flush()

    expect(session.getState().held!.revision).toBe('r2')
  })

  it('do not, when they were read at another: someone else wrote, and the rows held lack it', async () => {
    const { source, session } = await opened()
    source.before = (call) => {
      if (call.startsWith('cube:')) source.move('r9')
    }
    write(source, session, 900_001, { before: 'r0', after: 'r2' }, far)
    await flush()

    expect(session.getState().held!.revision).toBeNull()
    source.before = undefined as never
    source.calls.length = 0
    await session.view(months[5]!)
    expect(calls(source, 'reference').length).toBeGreaterThan(0)
  })

  it('do not either when the write’s receipt says another write ran beside it, whatever token they are read at', async () => {
    const { source, session } = await opened()
    write(source, session, 900_001, { before: 'r0', after: null }, far)
    await flush()

    expect(session.getState().held!.revision).toBeNull()
    source.calls.length = 0
    await session.view(months[5]!)
    expect(calls(source, 'reference').length).toBeGreaterThan(0)
  })

  it('that could not be read leave the months they belong to wrong, so the next month read starts from everything', async () => {
    const { source, session } = await opened()
    let down = true
    source.before = (call) => {
      if (call.startsWith('cube:') && down) throw new Error('cube down')
    }
    write(source, session, 900_001, { before: 'r0', after: 'r2' }, far)
    await flush()
    expect(session.getState().error).toContain('cube down')
    down = false
    source.calls.length = 0

    await session.view(months[5]!)

    expect(calls(source, 'reference').length).toBeGreaterThan(0)
    expect(calls(source, 'cube').length).toBeGreaterThan(0)
  })
})

describe('months read in more than one request after a write the server vouched for', () => {
  // Ten months of this ledger hold more rows than one request returns.
  const large = syntheticLedger({ months: 24, perMonth: 600, seed: 3 })
  const largeMonths = sortedMonths(large.transactions.map((t) => t.budgetMonth))

  it('are read again with everything else when one of the requests finds another revision', async () => {
    const source = memorySource(large)
    const session = new LedgerSession(source, { policy: WINDOWED })
    await session.open()
    rename(source, session, { before: 'r0', after: 'r2' })
    source.calls.length = 0
    let monthsReads = 0
    source.before = (call) => {
      if (call.startsWith('months:') && ++monthsReads === 2) source.move('r9')
    }

    await session.view(largeMonths[12]!)

    expect(monthsReads).toBeGreaterThan(1)
    expect(calls(source, 'reference').length).toBeGreaterThan(0)
  })

  it('are read alone when every one of them finds the revision the writes left', async () => {
    const source = memorySource(large)
    const session = new LedgerSession(source, { policy: WINDOWED })
    await session.open()
    rename(source, session, { before: 'r0', after: 'r2' })
    source.calls.length = 0

    await session.view(largeMonths[12]!)

    expect(calls(source, 'months:').length).toBeGreaterThan(1)
    expect(calls(source, 'reference')).toEqual([])
  })
})
