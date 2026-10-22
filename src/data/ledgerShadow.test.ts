import { afterEach, describe, expect, it, vi } from 'vitest'
import { adversarialLedger } from '../testing/adversarialLedger'
import { makeAttachment } from '../testing/factories'
import { memorySource } from '../testing/ledgerSource'
import { holdParts } from './ledgerHold'
import { readLedgerParts } from './ledgerLoader'
import { reportShadow, shadowDifferences } from './ledgerShadow'

const base = adversarialLedger()
const dataset = {
  ...base,
  attachments: base.attachments.filter((a) => base.transactions.some((t) => t.id === a.transactionId)),
}

async function heldFull() {
  return holdParts(await readLedgerParts(memorySource(dataset)))
}

describe('shadowDifferences', () => {
  it('finds nothing between a ledger held in full and the dataset it came from', async () => {
    expect(shadowDifferences(await heldFull(), dataset)).toEqual([])
  })

  it('names a reference table that differs', async () => {
    const other = { ...dataset, categories: dataset.categories.slice(1) }
    expect(shadowDifferences(await heldFull(), other)).toContain('categories differ')
  })

  it('names transactions the ledger lacks, has too many of, and holds differently', async () => {
    const [first, second, ...rest] = dataset.transactions
    const changed = { ...dataset, transactions: [{ ...first!, amountCents: first!.amountCents + 1 }, ...rest] }
    const out = shadowDifferences(await heldFull(), changed).join('\n')
    expect(out).toContain(`1 transactions only in the ledger: ${second!.id}`)
    expect(out).toContain(`1 transactions that differ: ${first!.id}`)
    const lacking = { ...dataset, transactions: [...dataset.transactions, { ...first!, id: 900_000 }] }
    expect(shadowDifferences(await heldFull(), lacking).join('\n')).toContain('1 transactions missing from the ledger: 900000')
  })

  it('does not mind the order of a row’s label ids', async () => {
    const target = dataset.transactions[0]!
    const held = holdParts(
      await readLedgerParts(memorySource({ ...dataset, transactions: dataset.transactions.map((t) => (t.id === target.id ? { ...t, labelIds: [1, 3] } : t)) })),
    )
    const flipped = { ...dataset, transactions: dataset.transactions.map((t) => (t.id === target.id ? { ...t, labelIds: [3, 1] } : t)) }
    expect(shadowDifferences(held, flipped)).toEqual([])
  })

  it('names months and receipt counts that differ', async () => {
    const withMore = { ...dataset, attachments: [...dataset.attachments, makeAttachment({ id: 99_000, transactionId: dataset.transactions[3]!.id })] }
    expect(shadowDifferences(await heldFull(), withMore)).toContain('the receipt counts differ')
    const fewer = { ...dataset, transactions: dataset.transactions.filter((t) => t.budgetMonth !== dataset.transactions[0]!.budgetMonth) }
    expect(shadowDifferences(await heldFull(), fewer)).toContain('the months with data differ')
  })

  it('says a window cannot be compared, and nothing else', async () => {
    const windowed = holdParts(await readLedgerParts(memorySource(dataset), { policy: { fullBelowRows: 0, dataMonths: 13 } }))
    expect(shadowDifferences(windowed, dataset)).toEqual(['the ledger holds only a window, so it cannot be compared with the whole dataset'])
  })
})

describe('reportShadow', () => {
  afterEach(() => {
    Reflect.deleteProperty(globalThis, '__ledgerShadow')
    vi.restoreAllMocks()
  })

  it('counts the checks, keeps the latest differences, and warns only when there are some', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    expect(reportShadow([])).toEqual({ checks: 1, differences: [] })
    expect(warn).not.toHaveBeenCalled()
    expect(reportShadow(['categories differ'])).toEqual({ checks: 2, differences: ['categories differ'] })
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('[ledger shadow]'), 'categories differ')
    expect((globalThis as { __ledgerShadow?: unknown }).__ledgerShadow).toEqual({ checks: 2, differences: ['categories differ'] })
  })
})
