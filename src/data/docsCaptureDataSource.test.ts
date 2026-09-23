import { describe, expect, it } from 'vitest'
import { docsCaptureDataSource } from './docsCaptureDataSource'

describe('docsCaptureDataSource.updateSettings', () => {
  it('returns the whole settings with the patch merged on, as the API does', async () => {
    const dataset = await docsCaptureDataSource.load()

    const updated = await docsCaptureDataSource.updateSettings!({ cashReserveMonths: 6 })

    // A patch alone would leave the Goals tab reading milestones off undefined.
    expect(updated.cashReserveMonths).toBe(6)
    expect(updated.milestones).toEqual(dataset.settings.milestones)
    expect(updated.claimantName).toBe(dataset.settings.claimantName)
  })
})

describe('docsCaptureDataSource.updateTransaction', () => {
  it('keeps the edited row’s id and merges the patch onto it, unlike a fresh stub', async () => {
    const dataset = await docsCaptureDataSource.load()
    const before = dataset.transactions[0]!

    const updated = await docsCaptureDataSource.updateTransaction!(before.id, {
      description: 'Renamed for the test',
    })

    // The bug: stubTxn always mints a new id, so the row the UI replaces (matched by
    // id) is never the one that was actually edited — the edit silently no-ops.
    expect(updated.id).toBe(before.id)
    expect(updated.description).toBe('Renamed for the test')
    // Every field the patch did not mention survives, same guarantee updateTransactions
    // already has.
    expect(updated.amountCents).toBe(before.amountCents)
    expect(updated.categoryId).toBe(before.categoryId)
    expect(updated.accountId).toBe(before.accountId)
    expect(updated.budgetMonth).toBe(before.budgetMonth)
    expect(updated.type).toBe(before.type)
  })

  it('persists the merge, so a later read of the same row sees it', async () => {
    const dataset = await docsCaptureDataSource.load()
    const target = dataset.transactions[1]!

    await docsCaptureDataSource.updateTransaction!(target.id, { description: 'First edit' })
    const second = await docsCaptureDataSource.updateTransaction!(target.id, { amountCents: 4_242 })

    // The second patch was built on the row updateTransactions already merged onto
    // `loaded`, not on a fresh stub — proves the mutation actually landed, not just
    // the one return value.
    expect(second.id).toBe(target.id)
    expect(second.description).toBe('First edit')
    expect(second.amountCents).toBe(4_242)
  })
})
