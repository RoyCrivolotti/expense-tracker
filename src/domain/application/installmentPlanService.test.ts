import { describe, expect, it } from 'vitest'
import { createPlan, patchPlan, removePlan, validatePlanInput } from './installmentPlanService'
import { inMemoryExpenseRepository } from '../../testing/inMemoryExpenseRepository'
import type { NewInstallmentPlan } from '../data/dataSource'

const validPlan: NewInstallmentPlan = {
  description: 'Iphone, Cetelam',
  totalCount: 24,
  amountCents: 5783,
  accountId: 1,
  categoryId: 2,
  type: 'expense',
  anchorBudgetMonth: '2026-01',
  startInstallmentIndex: 14,
  active: true,
}

function repoWithDefs() {
  return inMemoryExpenseRepository(
    {
      accounts: [{ id: 1, name: 'Cetelam', kind: 'credit', settlement: 'deferred', active: true }],
      categories: [{ id: 2, name: 'Tech', monthlyBudgetCents: 0, sortOrder: 0, active: true }],
    },
    'owner@example.com',
  )
}

describe('validatePlanInput', () => {
  it('accepts a well-formed plan', () => {
    expect(validatePlanInput(validPlan).description).toBe('Iphone, Cetelam')
  })

  it('rejects missing description', () => {
    expect(() => validatePlanInput({ ...validPlan, description: '  ' })).toThrow('Description')
  })

  it('rejects non-positive totalCount and amount', () => {
    expect(() => validatePlanInput({ ...validPlan, totalCount: 0 })).toThrow('totalCount')
    expect(() => validatePlanInput({ ...validPlan, amountCents: 0 })).toThrow('amountCents')
  })

  it('rejects a start index outside 1..totalCount', () => {
    expect(() => validatePlanInput({ ...validPlan, startInstallmentIndex: 25 })).toThrow(
      'startInstallmentIndex',
    )
  })

  it('rejects a malformed anchor month', () => {
    expect(() => validatePlanInput({ ...validPlan, anchorBudgetMonth: '2026/01' })).toThrow(
      'anchorBudgetMonth',
    )
  })
})

describe('installment plan lifecycle', () => {
  it('creates, patches, and removes a plan', async () => {
    const repo = repoWithDefs()
    const plan = await createPlan(repo, 'owner@example.com', validPlan)
    expect(plan.id).toBeGreaterThan(0)

    const updated = await patchPlan(repo, 'owner@example.com', plan.id, { active: false })
    expect(updated.active).toBe(false)

    await removePlan(repo, 'owner@example.com', plan.id)
    const dataset = await repo.loadDataset('owner@example.com')
    expect(dataset.installmentPlans).toHaveLength(0)
  })

  it('rejects an empty patch', async () => {
    const repo = repoWithDefs()
    const plan = await createPlan(repo, 'owner@example.com', validPlan)
    await expect(patchPlan(repo, 'owner@example.com', plan.id, {})).rejects.toThrow('Empty patch')
  })

  it('server-assigns installment index and blocks duplicates on insert', async () => {
    const repo = repoWithDefs()
    const plan = await createPlan(repo, 'owner@example.com', validPlan)
    const base = {
      date: '2026-01-15',
      budgetMonth: '2026-01',
      description: plan.description,
      accountId: 1,
      categoryId: 2,
      type: 'expense' as const,
      amountCents: 5783,
      cancelled: false,
      planId: plan.id,
    }
    const first = await repo.insertTransaction('owner@example.com', base)
    expect(first.installmentIndex).toBe(14)
    const second = await repo.insertTransaction('owner@example.com', {
      ...base,
      budgetMonth: '2026-02',
    })
    expect(second.installmentIndex).toBe(15)
    expect(() =>
      repo.insertTransaction('owner@example.com', { ...base, installmentIndex: 14 }),
    ).toThrow('already recorded')
  })
})
