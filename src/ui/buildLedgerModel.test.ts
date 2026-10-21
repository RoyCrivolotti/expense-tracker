import { describe, expect, it } from 'vitest'
import { HYDRATED_DATA_MONTHS, type HydrationPolicy, isCellRow, ledgerFor } from '../domain/ledger'
import { sortedMonths } from '../domain/engine/dates'
import { adversarialLedger } from '../testing/adversarialLedger'
import { comparable } from '../testing/ledgerSource'
import { randomLedger } from '../testing/randomLedger'
import { syntheticLedger } from '../testing/syntheticLedger'
import { buildExpenseModel } from './buildExpenseModel'
import { sumsOf } from './modelSums'
import { buildLedgerModel, fixedHistoryOf } from './buildLedgerModel'

const WINDOWED: HydrationPolicy = { fullBelowRows: 0, dataMonths: HYDRATED_DATA_MONTHS }

describe('buildLedgerModel, for a ledger that holds every row', () => {
  const datasets = [syntheticLedger({ months: 30, perMonth: 25, seed: 5 }), adversarialLedger(), randomLedger(3), randomLedger(11)]

  it('is the model buildExpenseModel makes from the whole dataset', () => {
    for (const dataset of datasets) {
      const whole = buildExpenseModel(dataset)
      const model = buildLedgerModel(ledgerFor(dataset, '2026-01'))
      expect(comparable(model.dataset.transactions)).toEqual(comparable(whole.dataset.transactions))
      expect({ ...model.dataset, transactions: [] }).toEqual({ ...whole.dataset, transactions: [] })
      expect(model.months).toEqual(whole.months)
    }
  })

  it('has no separate sums and no history, so every engine reads the same list as today', () => {
    const model = buildLedgerModel(ledgerFor(datasets[0]!, '2026-01'))
    expect(model.sums).toBeUndefined()
    expect(model.history).toBeUndefined()
    expect(sumsOf(model)).toBe(model.dataset)
    expect(sumsOf(model).transactions).toBe(model.dataset.transactions)
  })

  it('looks rows up the way the whole dataset does', () => {
    const dataset = datasets[0]!
    const whole = buildExpenseModel(dataset)
    const model = buildLedgerModel(ledgerFor(dataset, '2026-01'))
    for (const row of dataset.transactions.slice(0, 200)) {
      expect(model.lookup.settlementFor(row.id)?.id).toBe(whole.lookup.settlementFor(row.id)?.id)
      expect(model.lookup.settledBy(row.id).map((t) => t.id)).toEqual(whole.lookup.settledBy(row.id).map((t) => t.id))
    }
    expect(model.descriptionIndex.resolve('Rent')).toEqual(whole.descriptionIndex.resolve('Rent'))
  })
})

describe('buildLedgerModel, for a ledger that holds a window', () => {
  const dataset = adversarialLedger()
  const months = sortedMonths(dataset.transactions.map((t) => t.budgetMonth))
  const viewed = months[months.length - 1]!
  const history = fixedHistoryOf(dataset.transactions)
  const model = buildLedgerModel(ledgerFor(dataset, viewed, WINDOWED), { history })

  it('lists only real rows as transactions, and keeps every month in the picker', () => {
    expect(model.dataset.transactions.some(isCellRow)).toBe(false)
    expect(model.dataset.transactions.length).toBeLessThan(dataset.transactions.length)
    expect(model.months).toEqual(buildExpenseModel(dataset).months)
  })

  it('gives the engines that add amounts the real rows and one row per summed cell', () => {
    const sums = sumsOf(model)
    expect(sums).not.toBe(model.dataset)
    expect(sums.transactions.filter(isCellRow).length).toBeGreaterThan(0)
    expect(sums.transactions.filter((t) => !isCellRow(t))).toEqual(model.dataset.transactions)
    expect({ ...sums, transactions: [] }).toEqual({ ...model.dataset, transactions: [] })
  })

  it('carries the series of the whole history it was given', () => {
    expect(model.history).toBe(history)
    expect(history.groups.length).toBeGreaterThan(0)
  })

  it('leaves history out when none is given', () => {
    expect(buildLedgerModel(ledgerFor(dataset, viewed, WINDOWED)).history).toBeUndefined()
  })
})
