import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { buildDescriptionIndex, mergeDescriptionMatches, normalizeDescriptionKey } from '../data/descriptionIndex'
import type { HeldLedger } from '../data/ledgerHold'
import { DEFAULT_SUGGEST_LIMIT, MAX_SUGGEST_KEYS } from '../domain/data/descriptionSuggest'
import { mulberry32 } from '../domain/engine/rng'
import type { ExpenseDataset } from '../domain/types'
import { descriptionDataset, keyed, prefixesFor } from '../testing/descriptionLedger'
import { makeDataset, makeTransaction } from '../testing/factories'
import { type TestSource, memorySource } from '../testing/ledgerSource'
import { BROWSER_LOCALE, olderThan, withOlderDescriptions } from './ledgerDescriptions'

const SETTLE = 250

/**
 * A window over `dataset`: the rows booked from `from` on are held, and the server answers for the rest.
 * `expected(text)` is what the window should list once the server has answered: its own matches merged with the
 * descriptions starting with the text among the older rows, as `mergeDescriptionMatches` joins them.
 */
function windowOf(dataset: ExpenseDataset, from: string, source: TestSource = memorySource(dataset)) {
  const held = dataset.transactions.filter((t) => t.budgetMonth >= from)
  const own = buildDescriptionIndex(held, { locale: BROWSER_LOCALE })
  const server = keyed(dataset.transactions.filter((t) => t.budgetMonth < from), { locale: BROWSER_LOCALE })
  const index = withOlderDescriptions(own, source, { before: from, locale: BROWSER_LOCALE })
  const expected = (text: string, limit = DEFAULT_SUGGEST_LIMIT) =>
    labels(mergeDescriptionMatches(own.searchEntries(text, limit), server.searchEntries(normalizeDescriptionKey(text), limit), { text, limit }))
  /** The server's finds for `text` that the rows held do not list on their own. */
  const olderOnly = (text: string) => expected(text).filter((label) => !labels(own.search(text)).includes(label))
  return { index, source, own, expected, olderOnly }
}

/** The suggestions for `value`, as a combobox that is typed into would take them. */
function typing(index: ReturnType<typeof windowOf>['index'], first = '') {
  return renderHook(({ value }) => index.useSuggestions!(index, value), { initialProps: { value: first } })
}

const labels = (list: readonly { label: string }[]) => list.map((s) => s.label)
const settle = (ms = SETTLE) => act(() => vi.advanceTimersByTimeAsync(ms))

beforeEach(() => {
  vi.useFakeTimers()
  Object.defineProperty(navigator, 'onLine', { configurable: true, value: true })
})
afterEach(() => {
  vi.useRealTimers()
})

describe('the suggestions of a window', () => {
  it('are the rows held at once, and joined with the server’s older finds once the typing settles', async () => {
    const dataset = descriptionDataset(4)
    const { index, own, expected, source } = windowOf(dataset, '2026-04')
    // A text the rows held answer with fewer than a list's worth, so the server's finds show.
    const text = ['ca', 're', 'z', 'p', 'u', 'm'].find((t) => expected(t).length > own.search(t).length)!
    const view = typing(index, text)
    const first = view.result.current
    expect(first).toEqual(own.search(text))
    expect(source.calls).toEqual([])

    await settle()

    expect(source.calls).toEqual([`suggest:${text}|2026-04`])
    expect(labels(view.result.current)).toEqual(expected(text))
    expect(labels(view.result.current)).not.toEqual(labels(first))
  })

  it('equal the merge of both sides for any text, month the window starts at and way the rows came', async () => {
    let compared = 0
    for (const seed of [1, 2, 3]) {
      const dataset = descriptionDataset(seed)
      const rnd = mulberry32(seed)
      const prefixes = prefixesFor(dataset.transactions, rnd).filter(() => rnd() < 0.15)
      for (const from of ['2025-03', '2025-10', '2026-04', '2027-01']) {
        const { index, expected } = windowOf(dataset, from)
        const view = typing(index)
        for (const prefix of prefixes) {
          view.rerender({ value: prefix })
          await settle()
          expect(labels(view.result.current), JSON.stringify({ seed, from, prefix })).toEqual(expected(prefix))
          compared += 1
        }
      }
    }
    expect(compared).toBeGreaterThan(200)
  }, 60_000)

  it('ask for one prefix once when the typing goes on, and cancel the read it overtook', async () => {
    const { index, source } = windowOf(descriptionDataset(5), '2026-01')
    const signals: AbortSignal[] = []
    const read = source.readDescriptionSuggest.bind(source)
    source.readDescriptionSuggest = (request, options) => {
      if (options?.signal) signals.push(options.signal)
      return read(request, options)
    }
    const view = typing(index, 'c')
    await settle(100)
    view.rerender({ value: 'ca' })
    await settle(100)
    view.rerender({ value: 'caf' })
    await settle()
    view.rerender({ value: 'cafe' })
    await settle(10)

    expect(source.calls).toEqual(['suggest:caf|2026-01'])
    expect(signals[0]?.aborted).toBe(true)
  })

  it('are asked for again when the rows held change under the same prefix, because what was read belongs to the old rows', async () => {
    const dataset = descriptionDataset(9)
    const first = windowOf(dataset, '2026-01')
    const second = windowOf(dataset, '2026-01')
    const view = renderHook(({ index, value }) => index.useSuggestions!(index, value), {
      initialProps: { index: first.index, value: 'ca' },
    })
    await settle()
    expect(first.source.calls).toEqual(['suggest:ca|2026-01'])

    view.rerender({ index: second.index, value: 'ca' })
    await settle()

    expect(second.source.calls).toEqual(['suggest:ca|2026-01'])
  })

  it('keep the older matches that still fit while the next prefix is read, so they do not drop out and come back', async () => {
    const dataset = descriptionDataset(6)
    const { index, olderOnly } = windowOf(dataset, '2026-04')
    const view = typing(index, 'ca')
    await settle()
    const older = olderOnly('ca')
    expect(older.length).toBeGreaterThan(0)

    view.rerender({ value: 'caf' })

    const shown = labels(view.result.current)
    for (const label of older.filter((l) => l.toLowerCase().startsWith('caf'))) expect(shown).toContain(label)
  })

  it('ask nothing when a prefix was read before, or while offline, or when it is blank', async () => {
    const { index, source } = windowOf(descriptionDataset(7), '2026-01')
    const view = typing(index, 'ca')
    await settle()
    view.rerender({ value: 'c' })
    await settle()
    view.rerender({ value: 'ca' })
    await settle()
    expect(source.calls).toEqual(['suggest:ca|2026-01', 'suggest:c|2026-01'])

    Object.defineProperty(navigator, 'onLine', { configurable: true, value: false })
    view.rerender({ value: 'ren' })
    await settle()
    view.rerender({ value: '   ' })
    await settle()
    expect(source.calls).toHaveLength(2)
    expect(view.result.current).toEqual([])
  })

  it('keep the rows held when the server refuses, fails or says the prefix is too broad', async () => {
    const dataset = descriptionDataset(8)
    const { index, own, source } = windowOf(dataset, '2026-01')
    source.readDescriptionSuggest = () => Promise.reject(new Error('offline'))
    const view = typing(index, 're')
    await settle()
    expect(view.result.current).toEqual(own.search('re'))

    source.readDescriptionSuggest = () => Promise.resolve({ items: [], tooBroad: true })
    view.rerender({ value: 'ren' })
    await settle()
    expect(view.result.current).toEqual(own.search('ren'))
  })

  it('leave the older matches that still fit on view when the read for the next prefix fails', async () => {
    const { index, olderOnly, source } = windowOf(descriptionDataset(6), '2026-04')
    const view = typing(index, 'ca')
    await settle()
    const fit = olderOnly('ca').filter((l) => l.toLowerCase().startsWith('caf'))
    expect(fit.length).toBeGreaterThan(0)

    source.readDescriptionSuggest = () => Promise.reject(new Error('offline'))
    view.rerender({ value: 'caf' })
    await settle()

    for (const label of fit) expect(labels(view.result.current)).toContain(label)
  })

  it('take nothing from the items of an answer that says the prefix is too broad, which are not all its matches', async () => {
    const { index, expected, source } = windowOf(descriptionDataset(6), '2026-04')
    const answer = source.readDescriptionSuggest.bind(source)
    source.readDescriptionSuggest = async (request, options) => ({ ...(await answer(request, options)), tooBroad: true })
    const view = typing(index, 'ca')
    const own = view.result.current
    await settle()

    expect(expected('ca')).not.toEqual(labels(own))
    expect(view.result.current).toEqual(own)
  })

  it('treat a prefix the server calls too broad as the rows held, as the server counts', async () => {
    const wide = makeDataset({
      transactions: Array.from({ length: MAX_SUGGEST_KEYS + 5 }, (_, i) =>
        makeTransaction({ id: i + 1, description: `Wide ${i}`, budgetMonth: i < 3 ? '2026-02' : '2025-01', date: i < 3 ? '2026-02-01' : '2025-01-01' }),
      ),
    })
    const { index, source } = windowOf(wide, '2026-01')
    const view = typing(index, 'wide')
    await settle()

    expect(source.calls).toEqual(['suggest:wide|2026-01'])
    expect(view.result.current).toHaveLength(3)
  })
})

describe('where the rows held stop', () => {
  const held = (months: string[], withRows: string[]): HeldLedger =>
    ({ months, rows: new Map(withRows.map((m) => [m, []])) }) as unknown as HeldLedger

  it('is the oldest month of the run of months held up to the newest', () => {
    expect(olderThan(held(['2025-01', '2025-02', '2025-03', '2025-04'], ['2025-03', '2025-04']))).toEqual({ before: '2025-03' })
  })

  it('leaves out what is held beyond a gap, which the server answers for as well', () => {
    expect(olderThan(held(['2025-01', '2025-02', '2025-03', '2025-04'], ['2025-01', '2025-02', '2025-04']))).toEqual({ before: '2025-04' })
  })

  it('has no month when the newest is not held, so the server answers for every row', () => {
    expect(olderThan(held(['2025-01', '2025-02'], ['2025-01']))).toEqual({ before: undefined })
  })

  it('is null when every month is held, since there are no older rows to ask for', () => {
    expect(olderThan(held(['2025-01', '2025-02'], ['2025-01', '2025-02']))).toBeNull()
  })
})
