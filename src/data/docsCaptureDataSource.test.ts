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

describe('docsCaptureDataSource.updateFlag', () => {
  it('merges a partial patch onto the existing flag, unlike a fresh stub', async () => {
    const dataset = await docsCaptureDataSource.load()
    const before = dataset.flags.find((f) => f.name === 'Work travel')!

    // The auto-label editor's actual save: a patch with nothing but this one field.
    const updated = await docsCaptureDataSource.updateFlag!(before.id, { autoLabelId: 1 })

    // The bug: a stub built from the patch alone came back named "Flag", losing
    // everything the editor's own patch never mentioned.
    expect(updated.id).toBe(before.id)
    expect(updated.name).toBe('Work travel')
    expect(updated.color).toBe(before.color)
    expect(updated.reimbursable).toBe(before.reimbursable)
    expect(updated.autoLabelId).toBe(1)
  })

  it('persists the merge, so a later read of the same flag sees it', async () => {
    const dataset = await docsCaptureDataSource.load()
    const target = dataset.flags.find((f) => f.name === 'Tax deductible')!

    await docsCaptureDataSource.updateFlag!(target.id, { autoLabelId: 2 })
    const second = await docsCaptureDataSource.updateFlag!(target.id, { description: 'Reviewed yearly' })

    expect(second.id).toBe(target.id)
    expect(second.autoLabelId).toBe(2)
    expect(second.description).toBe('Reviewed yearly')
  })

  it('clears autoLabelId on an explicit null, same contract as the real API', async () => {
    const dataset = await docsCaptureDataSource.load()
    const target = dataset.flags.find((f) => f.name === 'Work travel')!

    await docsCaptureDataSource.updateFlag!(target.id, { autoLabelId: 3 })
    const cleared = await docsCaptureDataSource.updateFlag!(target.id, { autoLabelId: null })

    expect(cleared.autoLabelId).toBeUndefined()
    expect(cleared.name).toBe('Work travel')
  })

  it('retroactively labels every transaction already carrying the flag', async () => {
    const dataset = await docsCaptureDataSource.load()
    const target = dataset.flags.find((f) => f.name === 'Work travel')!
    const flagged = dataset.transactions.filter((t) => t.flagId === target.id)
    const untouchedRow = dataset.transactions.find((t) => t.flagId !== target.id)!
    expect(flagged.length).toBeGreaterThan(0)

    await docsCaptureDataSource.updateFlag!(target.id, { autoLabelId: 1 })

    // The bug: the real backend's applyLabelToFlaggedTransactions has no mirror
    // here, so configuring an auto-label did nothing to rows already flagged.
    // An empty-patch updateTransaction is a no-op read of the persisted row,
    // same probe the "persists the merge" tests above use.
    for (const row of flagged) {
      const after = await docsCaptureDataSource.updateTransaction!(row.id, {})
      expect(after.labelIds).toContain(1)
    }
    // A row that never carried the flag is untouched by the retroactive apply.
    const untouchedAfter = await docsCaptureDataSource.updateTransaction!(untouchedRow.id, {})
    expect(untouchedAfter.labelIds ?? []).not.toContain(1)
  })

  it('does not duplicate the label when the same auto-label is configured twice', async () => {
    const dataset = await docsCaptureDataSource.load()
    const target = dataset.flags.find((f) => f.name === 'Work travel')!
    const flaggedRow = dataset.transactions.find((t) => t.flagId === target.id)!

    await docsCaptureDataSource.updateFlag!(target.id, { autoLabelId: 1 })
    await docsCaptureDataSource.updateFlag!(target.id, { autoLabelId: 1 })
    const updated = await docsCaptureDataSource.updateTransaction!(flaggedRow.id, {})

    expect(updated.labelIds?.filter((id) => id === 1)).toEqual([1])
  })

  it('does not fan out a label when the flag has no auto-label configured', async () => {
    const dataset = await docsCaptureDataSource.load()
    const target = dataset.flags.find((f) => f.name === 'Tax deductible')!
    const flaggedRow = dataset.transactions.find((t) => t.flagId === target.id)

    await docsCaptureDataSource.updateFlag!(target.id, { description: 'Reviewed yearly' })

    if (flaggedRow) {
      const updated = await docsCaptureDataSource.updateTransaction!(flaggedRow.id, {})
      expect(updated.labelIds ?? []).toEqual(flaggedRow.labelIds ?? [])
    }
  })
})

describe('docsCaptureDataSource auto-label forward apply', () => {
  it('labels a newly created transaction whose flag has an auto-label', async () => {
    const dataset = await docsCaptureDataSource.load()
    const target = dataset.flags.find((f) => f.name === 'Work travel')!
    await docsCaptureDataSource.updateFlag!(target.id, { autoLabelId: 1 })

    const created = await docsCaptureDataSource.createTransaction!({
      date: '2026-09-30',
      budgetMonth: '2026-09',
      description: 'Client dinner',
      accountId: 1,
      categoryId: 1,
      type: 'expense',
      amountCents: 3_200,
      cancelled: false,
      flagId: target.id,
    })

    expect(created.labelIds).toContain(1)
  })

  it('labels a transaction when its flagId is updated to a flag with an auto-label', async () => {
    const dataset = await docsCaptureDataSource.load()
    const target = dataset.flags.find((f) => f.name === 'Work travel')!
    await docsCaptureDataSource.updateFlag!(target.id, { autoLabelId: 1 })
    const unflaggedRow = dataset.transactions.find((t) => t.flagId == null)!

    const updated = await docsCaptureDataSource.updateTransaction!(unflaggedRow.id, {
      flagId: target.id,
    })

    expect(updated.labelIds).toContain(1)
  })

  it('does not duplicate a label the transaction already carries independently', async () => {
    const dataset = await docsCaptureDataSource.load()
    const target = dataset.flags.find((f) => f.name === 'Work travel')!
    await docsCaptureDataSource.updateFlag!(target.id, { autoLabelId: 1 })
    const unflaggedRow = dataset.transactions.find((t) => t.flagId == null)!
    await docsCaptureDataSource.setTransactionLabels!(unflaggedRow.id, [1])

    const updated = await docsCaptureDataSource.updateTransaction!(unflaggedRow.id, {
      flagId: target.id,
    })

    expect(updated.labelIds?.filter((id) => id === 1)).toEqual([1])
  })

  it('does not label a transaction whose flag has no auto-label', async () => {
    const dataset = await docsCaptureDataSource.load()
    const target = dataset.flags.find((f) => f.name === 'Tax deductible')!
    const unflaggedRow = dataset.transactions.find((t) => t.flagId == null)!

    const updated = await docsCaptureDataSource.updateTransaction!(unflaggedRow.id, {
      flagId: target.id,
    })

    expect(updated.labelIds ?? []).toEqual(unflaggedRow.labelIds ?? [])
  })
})

describe('docsCaptureDataSource.createLabel', () => {
  it('registers the new label so a same-session updateLabel finds it', async () => {
    await docsCaptureDataSource.load()

    const created = await docsCaptureDataSource.createLabel!({
      name: 'Madrid trip',
      color: '#10b981',
      sortOrder: 0,
      active: true,
    })
    const updated = await docsCaptureDataSource.updateLabel!(created.id, { name: 'Madrid trip, May' })

    // The bug: an unregistered createLabel left updateLabel with nothing to merge
    // onto, so it fell back to a stub that lost sortOrder and color.
    expect(updated.name).toBe('Madrid trip, May')
    expect(updated.color).toBe('#10b981')
    expect(updated.sortOrder).toBe(0)
  })
})

describe('docsCaptureDataSource.updateLabel', () => {
  it('merges a partial patch onto the existing label, unlike a fresh stub', async () => {
    await docsCaptureDataSource.load()
    const label = await docsCaptureDataSource.createLabel!({
      name: 'Work trip',
      color: '#6366f1',
      sortOrder: 3,
      active: true,
    })

    // A rename sends only the one field, same as the real editor.
    const updated = await docsCaptureDataSource.updateLabel!(label.id, { name: 'Work trip, renamed' })

    expect(updated.id).toBe(label.id)
    expect(updated.name).toBe('Work trip, renamed')
    // The bug: a stub built from the patch alone silently reset this to 0.
    expect(updated.sortOrder).toBe(3)
    expect(updated.color).toBe('#6366f1')
  })

  it('persists the merge, so a later read of the same label sees it', async () => {
    await docsCaptureDataSource.load()
    const label = await docsCaptureDataSource.createLabel!({
      name: 'Friend trip',
      color: '#f59e0b',
      sortOrder: 1,
      active: true,
    })

    await docsCaptureDataSource.updateLabel!(label.id, { description: 'Group travel' })
    const second = await docsCaptureDataSource.updateLabel!(label.id, { sortOrder: 2 })

    expect(second.description).toBe('Group travel')
    expect(second.sortOrder).toBe(2)
  })
})

describe('docsCaptureDataSource.createTransaction', () => {
  it('registers the new row so a same-session lookup by id finds it', async () => {
    await docsCaptureDataSource.load()

    const created = await docsCaptureDataSource.createTransaction!({
      date: '2026-09-30',
      budgetMonth: '2026-09',
      description: 'Kyoto ryokan',
      accountId: 1,
      categoryId: 1,
      type: 'expense',
      amountCents: 4_500,
      cancelled: false,
    })
    // Exactly the sequence TransactionForm's submit runs: create, then set the
    // label set against the id the create just returned, in the same session.
    const labelled = await docsCaptureDataSource.setTransactionLabels!(created.id, [1])

    expect(labelled.id).toBe(created.id)
    expect(labelled.labelIds).toEqual([1])
  })
})

describe('docsCaptureDataSource.setTransactionLabels', () => {
  it('merges labelIds onto the existing row, keeping everything else intact', async () => {
    const dataset = await docsCaptureDataSource.load()
    const before = dataset.transactions[0]!

    const updated = await docsCaptureDataSource.setTransactionLabels!(before.id, [1, 2])

    expect(updated.id).toBe(before.id)
    expect(updated.labelIds).toEqual([1, 2])
    expect(updated.amountCents).toBe(before.amountCents)
    expect(updated.description).toBe(before.description)
  })

  it('persists the merge, so a later read of the same row sees it', async () => {
    const dataset = await docsCaptureDataSource.load()
    const target = dataset.transactions[1]!

    await docsCaptureDataSource.setTransactionLabels!(target.id, [3])
    const second = await docsCaptureDataSource.setTransactionLabels!(target.id, [3, 4])

    expect(second.labelIds).toEqual([3, 4])
    expect(second.description).toBe(target.description)
  })

  it('rejects rather than fabricating a row for an id nothing loaded', async () => {
    await docsCaptureDataSource.load()

    await expect(docsCaptureDataSource.setTransactionLabels!(999_999, [1])).rejects.toThrow(
      'Transaction not found',
    )
  })
})
