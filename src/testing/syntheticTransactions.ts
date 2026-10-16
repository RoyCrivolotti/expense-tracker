/**
 * Row generation for a synthetic ledger. Shaped to hit the cases the engines treat specially: fixed
 * monthly, quarterly and yearly series (recurring detection), plan instalments, flagged rows settled by a
 * refund, negative investments, cancelled rows and refunds, on immediate and deferred accounts.
 */
import type { InstallmentPlan, StoredTransaction } from '../domain/types'
import { monthsBetweenBudget } from '../domain/engine/dates'
import { CAT, CHECKING, CASH, TRAVEL_CARD, VISA } from './syntheticReference'

export type Rng = () => number

export interface RowDraft extends Omit<StoredTransaction, 'id'> {
  labelIds: number[]
  /** Rows sharing a group are settled together by one refund, added by the composer. */
  claimGroup?: string
}

const pad = (n: number): string => String(n).padStart(2, '0')
const pick = <T>(items: readonly T[], rnd: Rng): T => items[Math.floor(rnd() * items.length)] as T
const between = (lo: number, hi: number, rnd: Rng): number => lo + Math.floor(rnd() * (hi - lo + 1))

/** [merchant, category, min cents, max cents] */
const MERCHANTS: ReadonlyArray<readonly [string, number, number, number]> = [
  ['Corner Market', CAT.groceries, 800, 9_000],
  ['Fresh Foods', CAT.groceries, 1_500, 14_000],
  ['Metro ticket', CAT.transport, 150, 900],
  ['Ride share', CAT.transport, 600, 3_500],
  ['Cafe Central', CAT.dining, 250, 1_800],
  ['Bistro Nova', CAT.dining, 1_800, 8_500],
  ['Pharmacy', CAT.health, 400, 4_000],
  ['Clinic visit', CAT.health, 2_500, 9_000],
  ['Online store', CAT.shopping, 900, 22_000],
  ['Hardware shop', CAT.shopping, 600, 12_000],
  ['Cinema', CAT.entertainment, 900, 2_800],
  ['Concert tickets', CAT.entertainment, 3_000, 15_000],
  ['Gift shop', CAT.gifts, 1_000, 8_000],
  ['Course fee', CAT.education, 2_000, 30_000],
  ['Hotel stay', CAT.travel, 8_000, 40_000],
  ['Misc', CAT.other, 200, 6_000],
]

function row(
  month: string,
  day: number,
  fields: Pick<RowDraft, 'description' | 'accountId' | 'categoryId' | 'type' | 'amountCents'> &
    Partial<RowDraft>,
): RowDraft {
  const date = `${month}-${pad(Math.min(day, 28))}`
  return { date, budgetMonth: month, cancelled: false, labelIds: [], createdAt: `${date}T09:00:00Z`, ...fields }
}

function seriesRows(month: string, monthIndex: number): RowDraft[] {
  const mm = Number(month.slice(5))
  const out: RowDraft[] = [
    row(month, 1, { description: 'Rent', accountId: CHECKING, categoryId: CAT.rent, type: 'expense', amountCents: 95_000 }),
    row(month, 5, { description: 'Music streaming', accountId: VISA, categoryId: CAT.subscriptions, type: 'expense', amountCents: 1_099 }),
    row(month, 8, { description: 'Gym membership', accountId: CHECKING, categoryId: CAT.health, type: 'expense', amountCents: 3_900 }),
    row(month, 25, { description: 'Salary', accountId: CHECKING, categoryId: CAT.salary, type: 'income', amountCents: 320_000 }),
    row(month, 26, { description: 'Index fund', accountId: CHECKING, categoryId: CAT.investments, type: 'investment', amountCents: 80_000 }),
  ]
  if (mm % 3 === 1) {
    out.push(row(month, 14, { description: 'Water bill', accountId: CHECKING, categoryId: CAT.utilities, type: 'expense', amountCents: 6_400 }))
  }
  if (mm === 3) {
    out.push(row(month, 10, { description: 'Car insurance', accountId: CHECKING, categoryId: CAT.insurance, type: 'expense', amountCents: 48_000 }))
  }
  if (monthIndex % 9 === 8) {
    out.push(row(month, 20, { description: 'Broker withdrawal', accountId: CHECKING, categoryId: CAT.investments, type: 'investment', amountCents: -25_000 }))
  }
  return out
}

function claimRows(month: string): RowDraft[] {
  const group = `claim-${month}`
  const trip = { accountId: TRAVEL_CARD, categoryId: CAT.travel, type: 'expense' as const, flagId: 1, claimGroup: group }
  return [
    row(month, 9, { ...trip, description: 'Client trip train', amountCents: 12_800 }),
    row(month, 10, { ...trip, description: 'Client trip hotel', amountCents: 21_000 }),
  ]
}

function ordinaryRow(month: string, rnd: Rng): RowDraft {
  const [name, categoryId, lo, hi] = pick(MERCHANTS, rnd)
  const accountId = pick([CHECKING, CHECKING, CASH, VISA, VISA, TRAVEL_CARD], rnd)
  const roll = rnd()
  const type = roll < 0.03 ? ('refund' as const) : ('expense' as const)
  const labelIds = rnd() < 0.1 ? [between(1, 3, rnd)] : []
  return row(month, between(1, 28, rnd), {
    description: `${name} ${between(1, 6, rnd)}`,
    accountId,
    categoryId,
    type,
    amountCents: between(lo, hi, rnd),
    cancelled: roll > 0.99,
    labelIds,
    ...(rnd() < 0.01 ? { flagId: 2 } : {}),
  })
}

/** The instalment of each plan that falls due in `month`, if any. */
export function planDrafts(month: string, plans: InstallmentPlan[]): RowDraft[] {
  return plans.flatMap((plan) => {
    const index = monthsBetweenBudget(plan.anchorBudgetMonth, month) + plan.startInstallmentIndex
    if (index < plan.startInstallmentIndex || index > plan.totalCount) return []
    const { accountId, categoryId, type, amountCents, description } = plan
    return [
      row(month, plan.dueDayOfMonth ?? 12, {
        description,
        accountId,
        categoryId,
        type,
        amountCents,
        planId: plan.id,
        installmentIndex: index,
      }),
    ]
  })
}

/** One month of rows, before ids are assigned. */
export function monthDrafts(month: string, monthIndex: number, perMonth: number, rnd: Rng): RowDraft[] {
  const rows = seriesRows(month, monthIndex)
  if (monthIndex % 6 === 5) rows.push(...claimRows(month))
  for (let i = 0; i < perMonth; i += 1) rows.push(ordinaryRow(month, rnd))
  return rows
}
