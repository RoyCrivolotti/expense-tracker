/**
 * One owner's ledger with a row in every table the dataset reads, plus a spare, unreferenced row of each
 * kind a route can delete. Written through the real routes, so the middleware bumps as it would. The one
 * installment plan is due next month, so reading the dataset in October 2026 backfills nothing.
 */
import type { NewGoalScenario } from '../../domain/data/dataSource'
import { DEFAULT_HOME_CARRY_RATE, DEFAULT_RETIREMENT_YEARS } from '../../domain/engine/projectionConstants'
import { onRequestPost as postAccount } from '../../api/expenses/accounts/index'
import { onRequestPost as postCategory } from '../../api/expenses/categories/index'
import { onRequestPost as postFlag } from '../../api/expenses/flags/index'
import { onRequestPost as postLabel } from '../../api/expenses/labels/index'
import { onRequestPost as postTransaction } from '../../api/expenses/transactions/index'
import { onRequestPut as putTransactionLabels } from '../../api/expenses/transactions/[id]/labels'
import { onRequestPost as postPlan } from '../../api/expenses/installment-plans/index'
import { onRequestPost as postScenario } from '../../api/expenses/scenarios/index'
import { onRequestPost as postWealthAccount } from '../../api/expenses/wealth-accounts/index'
import { onRequestPost as postCheckin } from '../../api/expenses/wealth-checkins/index'
import { onRequestPost as postAttachment } from '../../api/expenses/attachments/index'
import { onRequestPut as putCashActual } from '../../api/expenses/cash-actuals/index'
import { onRequestPut as putStatement } from '../../api/expenses/statements/index'
import type { Handler, World } from './expenseWorld'

export interface SeededIds {
  debit: number
  card: number
  groceries: number
  travel: number
  flag: number
  label: number
  spareAccount: number
  spareCategory: number
  spareFlag: number
  spareLabel: number
  spareTransaction: number
  transactions: number[]
  plan: number
  scenario: number
  spareScenario: number
  wealthAccount: number
  spareWealthAccount: number
  checkin: number
  spareCheckin: number
  attachment: number
}

export function scenarioInput(overrides: Partial<NewGoalScenario> = {}): NewGoalScenario {
  return {
    name: 'Scenario',
    color: '#6366f1',
    sortOrder: 0,
    startInvestedCents: 10_000_000,
    monthlyContributionCents: 100_000,
    expectedRealReturn: 0.07,
    horizonYears: 30,
    housePriceCents: 400_000_000,
    downPaymentFraction: 0.2,
    housePurchaseYear: null,
    transactionCostsCents: 0,
    mortgageTermYears: 30,
    mortgageRateAnnual: 0.03,
    houseAppreciationRate: 0.025,
    rentMonthlyCents: 0,
    annualSpendCents: 0,
    safeWithdrawalRate: 0.04,
    planStartDate: null,
    lifeEvents: [],
    contributionSchedule: [],
    homeCarryRate: DEFAULT_HOME_CARRY_RATE,
    retirementYears: DEFAULT_RETIREMENT_YEARS,
    ...overrides,
  }
}

export function uploadForm(transactionId: number): FormData {
  const bytes = new Uint8Array(64)
  bytes.set([0xff, 0xd8, 0xff, 0xe0])
  const form = new FormData()
  form.set('transactionId', String(transactionId))
  form.set('file', new Blob([bytes], { type: 'image/jpeg' }), 'receipt.jpg')
  return form
}

async function created(world: World, handler: Handler, path: string, body: unknown): Promise<number> {
  const response = await world.call(handler, { method: 'POST', path, body })
  if (response.status !== 201) {
    throw new Error(`seeding ${path}: ${response.status} ${await response.text()}`)
  }
  return (await response.json<{ id: number }>()).id
}

async function ok(world: World, handler: Handler, method: string, path: string, body: unknown, params?: Record<string, string>) {
  const response = await world.call(handler, { method, path, body, ...(params ? { params } : {}) })
  if (response.status !== 200) throw new Error(`seeding ${method} ${path}: ${response.status}`)
  return response
}

export function expense(accountId: number, categoryId: number, description: string, day: string) {
  return {
    date: day,
    budgetMonth: day.slice(0, 7),
    description,
    accountId,
    categoryId,
    type: 'expense',
    amountCents: 12_300,
    cancelled: false,
  }
}

type Reference = Pick<
  SeededIds,
  'debit' | 'card' | 'spareAccount' | 'groceries' | 'travel' | 'spareCategory' | 'flag' | 'spareFlag' | 'label' | 'spareLabel'
>

async function seedReference(world: World): Promise<Reference> {
  const account = (name: string, kind: string, settlement: string) =>
    created(world, postAccount, '/accounts', { name, kind, settlement, active: true })
  const category = (name: string, sortOrder: number) =>
    created(world, postCategory, '/categories', { name, monthlyBudgetCents: 50_000, sortOrder, active: true })
  const tag = (handler: Handler, path: string, name: string, color: string, sortOrder: number) =>
    created(world, handler, path, { name, color, sortOrder, active: true })
  return {
    debit: await account('Debit', 'debit', 'immediate'),
    card: await account('Card', 'credit', 'deferred'),
    spareAccount: await account('Spare account', 'debit', 'immediate'),
    groceries: await category('Groceries', 1),
    travel: await category('Travel', 2),
    spareCategory: await category('Spare category', 3),
    flag: await tag(postFlag, '/flags', 'Work', '#6366F1', 0),
    spareFlag: await tag(postFlag, '/flags', 'Spare flag', '#10B981', 1),
    label: await tag(postLabel, '/labels', 'Trip', '#10B981', 0),
    spareLabel: await tag(postLabel, '/labels', 'Spare label', '#F59E0B', 1),
  }
}

type Ledger = Pick<
  SeededIds,
  'transactions' | 'spareTransaction' | 'plan' | 'attachment'
>

async function seedLedgerRows(world: World, r: Reference): Promise<Ledger> {
  const txn = (accountId: number, categoryId: number, description: string, day: string) =>
    created(world, postTransaction, '/transactions', expense(accountId, categoryId, description, day))
  const t1 = await txn(r.debit, r.groceries, 'Market', '2026-10-02')
  const t2 = await txn(r.card, r.travel, 'Train', '2026-10-05')
  const spareTransaction = await txn(r.debit, r.groceries, 'Spare', '2026-10-06')
  await ok(world, putTransactionLabels, 'PUT', `/transactions/${t2}/labels`, { labelIds: [r.label] }, { id: String(t2) })
  const plan = await created(world, postPlan, '/installment-plans', {
    description: 'Sofa',
    totalCount: 3,
    amountCents: 30_000,
    accountId: r.card,
    categoryId: r.travel,
    type: 'expense',
    anchorBudgetMonth: '2026-11',
    startInstallmentIndex: 1,
    active: true,
  })
  await ok(world, putStatement, 'PUT', '/statements', { accountId: r.card, yearMonth: '2026-09', paid: true, paidOn: '2026-09-20' })
  await ok(world, putCashActual, 'PUT', '/cash-actuals', { yearMonth: '2026-09', actualCashCents: 150_000 })
  const uploaded = await world.call(postAttachment, { method: 'POST', path: '/attachments', rawBody: uploadForm(t1) })
  if (uploaded.status !== 201) throw new Error(`seeding attachment: ${uploaded.status}`)
  const attachment = (await uploaded.json<{ id: number }>()).id
  return { transactions: [t1, t2], spareTransaction, plan, attachment }
}

type Planning = Pick<
  SeededIds,
  'scenario' | 'spareScenario' | 'wealthAccount' | 'spareWealthAccount' | 'checkin' | 'spareCheckin'
>

async function seedPlanning(world: World): Promise<Planning> {
  const wealthAccount = await created(world, postWealthAccount, '/wealth-accounts', {
    name: 'Broker', kind: 'investment', sortOrder: 0, archived: false,
  })
  const entries = [{ accountId: wealthAccount, valueCents: 5_000_000 }]
  return {
    scenario: await created(world, postScenario, '/scenarios', scenarioInput({ name: 'Base' })),
    spareScenario: await created(world, postScenario, '/scenarios', scenarioInput({ name: 'Spare' })),
    wealthAccount,
    spareWealthAccount: await created(world, postWealthAccount, '/wealth-accounts', {
      name: 'Spare wealth account', kind: 'cash', sortOrder: 1, archived: false,
    }),
    checkin: await created(world, postCheckin, '/wealth-checkins', { checkinDate: '2026-06-01', note: 'Q2', entries }),
    spareCheckin: await created(world, postCheckin, '/wealth-checkins', { checkinDate: '2026-07-01', entries }),
  }
}

export async function seedLedger(world: World): Promise<SeededIds> {
  const reference = await seedReference(world)
  const ledger = await seedLedgerRows(world, reference)
  const planning = await seedPlanning(world)
  return { ...reference, ...ledger, ...planning }
}
