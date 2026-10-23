// @vitest-environment node
/**
 * Writes the server cascades, end to end: the browser's own writes through the real routes, auth middleware and
 * D1 adapter's SQL on SQLite with the real migrations, the session patched the way a screen patches it, and the
 * list read in pages refreshed by `applyWrite`, which does so only when `patch()` says so. After every write the list on screen must equal a list
 * read afresh. A ledger held in full and a window, and the steps in the order a seeded shuffle gives, so that no
 * order of them is left to chance.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { apiDataSource } from '../../../src/data/apiDataSource'
import { apiLedgerParts } from '../../../src/data/apiLedgerParts'
import { applyWrite } from '../../../src/data/applyWrite'
import { LedgerSession } from '../../../src/data/ledgerSession'
import { TransactionPager } from '../../../src/data/transactionPager'
import { sortedMonths } from '../../../src/domain/engine/dates'
import type { TxnFilter } from '../../../src/domain/engine/transactions'
import { mulberry32 } from '../../../src/domain/engine/rng'
import { HYDRATED_DATA_MONTHS, type HydrationPolicy } from '../../../src/domain/ledger'
import type { ExpenseDataset } from '../../../src/domain/types'
import { comparable } from '../../../src/testing/ledgerSource'
import { seedDataset } from '../../../src/testing/seedSqlite'
import { migratedDatabase, newStats, sqliteD1 } from '../../../src/testing/sqliteD1'
import { syntheticLedger } from '../../../src/testing/syntheticLedger'
import { CAT, VISA } from '../../../src/testing/syntheticReference'
import {
  patchAfterCategoryDelete,
  patchAfterFlag,
  patchAfterInstallmentPlanCreate,
  patchAfterInstallmentPlanDelete,
  patchAfterLabelDelete,
  patchAfterStatementPaid,
} from '../../../src/ui/datasetPatches'
import { OWNER, createExpenseWorld, pinClock, type Handler, type World } from '../../_shared/testing/expenseWorld'
import { onRequestGet as getCube } from './cube'
import { onRequestPatch as patchFlag } from './flags/[id]'
import { onRequestPost as postPlan } from './installment-plans/index'
import { onRequestDelete as deletePlan } from './installment-plans/[id]'
import { onRequestDelete as deleteCategory } from './categories/[id]'
import { onRequestDelete as deleteLabel } from './labels/[id]'
import { onRequestGet as getReference } from './reference'
import { onRequestPut as putStatement } from './statements/index'
import { onRequestGet as getList } from './transactions/list'
import { onRequestGet as getMonths } from './transactions/months'
import { onRequestGet as getSummary } from './transactions/summary'

const SLOW = 120_000
const WINDOWED: HydrationPolicy = { fullBelowRows: 0, dataMonths: HYDRATED_DATA_MONTHS }
const FULL: HydrationPolicy = { fullBelowRows: 1_000_000, dataMonths: HYDRATED_DATA_MONTHS }

/** Routes the browser's requests to the handlers, the way Pages does, with the id of a `[id]` route as its param. */
function routeFetch(world: World) {
  const routes: Array<[RegExp, string, Handler]> = [
    [/^\/api\/expenses\/transactions\/months$/, 'GET', getMonths],
    [/^\/api\/expenses\/transactions\/list$/, 'GET', getList],
    [/^\/api\/expenses\/transactions\/summary$/, 'GET', getSummary],
    [/^\/api\/expenses\/reference$/, 'GET', getReference],
    [/^\/api\/expenses\/cube$/, 'GET', getCube],
    [/^\/api\/expenses\/installment-plans$/, 'POST', postPlan],
    [/^\/api\/expenses\/installment-plans\/(\d+)$/, 'DELETE', deletePlan],
    [/^\/api\/expenses\/flags\/(\d+)$/, 'PATCH', patchFlag],
    [/^\/api\/expenses\/labels\/(\d+)$/, 'DELETE', deleteLabel],
    [/^\/api\/expenses\/categories\/(\d+)$/, 'DELETE', deleteCategory],
    [/^\/api\/expenses\/statements$/, 'PUT', putStatement],
  ]
  return async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const url = new URL(String(input), 'https://expenses.test')
    const method = init?.method ?? 'GET'
    for (const [pattern, verb, handler] of routes) {
      const match = pattern.exec(url.pathname)
      if (!match || verb !== method) continue
      const body = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : undefined
      return world.call(handler, {
        method,
        path: `${url.pathname.slice('/api/expenses'.length)}${url.search}`,
        ...(match[1] ? { params: { id: match[1] } } : {}),
        ...(body ? { body } : {}),
      })
    }
    throw new Error(`no route for ${method} ${url.pathname}`)
  }
}

interface Step {
  name: string
  /** The list on screen when it happens: what it reaches, in a range short enough to be read in one page. */
  filter: (months: string[]) => TxnFilter
  /** Makes the write through the real routes, and answers the patch the screen applies for it. */
  write: (months: string[]) => Promise<(d: ExpenseDataset) => ExpenseDataset>
}

const recent = (months: string[]): TxnFilter => ({ dateFrom: `${months[months.length - 3]!}-01`, dateTo: `${months[months.length - 1]!}-31` })

const STEPS: Step[] = [
  {
    name: 'a plan deleted',
    filter: recent,
    write: async () => {
      await apiDataSource.deleteInstallmentPlan(1)
      return (d) => patchAfterInstallmentPlanDelete(d, 1)
    },
  },
  {
    name: 'a plan added',
    filter: recent,
    write: async (months) => {
      const plan = await apiDataSource.createInstallmentPlan({
        description: 'Sofa',
        totalCount: 12,
        amountCents: 9_900,
        accountId: VISA,
        categoryId: CAT.groceries,
        type: 'expense',
        anchorBudgetMonth: months[months.length - 3]!,
        startInstallmentIndex: 1,
        active: true,
      })
      return (d) => patchAfterInstallmentPlanCreate(d, plan)
    },
  },
  {
    name: 'a flag given an auto-label',
    filter: recent,
    write: async () => {
      const flag = await apiDataSource.updateFlag(1, { autoLabelId: 1 })
      return (d) => patchAfterFlag(d, flag)
    },
  },
  {
    name: 'a label deleted',
    filter: recent,
    write: async () => {
      await apiDataSource.deleteLabel(2)
      return (d) => patchAfterLabelDelete(d, 2)
    },
  },
  {
    name: 'a category deleted, its rows moved',
    filter: recent,
    write: async () => {
      const result = await apiDataSource.deleteCategory(CAT.shopping, { reassignToId: CAT.groceries })
      return (d) => patchAfterCategoryDelete(d, CAT.shopping, result)
    },
  },
  {
    name: 'an old card statement marked unpaid',
    filter: (months) => ({ dateFrom: `${months[2]!}-01`, dateTo: `${months[2]!}-28` }),
    write: async (months) => {
      const statement = await apiDataSource.setStatementPaid(VISA, months[2]!, false)
      return (d) => patchAfterStatementPaid(d, statement)
    },
  },
]

let world: World
let source: ExpenseDataset
let months: string[]

beforeAll(() => {
  source = syntheticLedger({ months: 24, perMonth: 10, seed: 1, endMonth: '2026-08' })
  months = sortedMonths(source.transactions.map((t) => t.budgetMonth))
})
afterAll(() => vi.useRealTimers())
afterEach(() => vi.unstubAllGlobals())

function shuffled<T>(items: T[], seed: number): T[] {
  const rnd = mulberry32(seed)
  const order = [...items]
  for (let i = order.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rnd() * (i + 1))
    ;[order[i], order[j]] = [order[j]!, order[i]!]
  }
  return order
}

/** The list once everything it shows has been read, as a screen scrolled to the end has: a refresh keeps the depth it had. */
async function listOf(pager: TransactionPager) {
  const idle = () => {
    const state = pager.getState()
    expect(state.loading || state.refreshing).toBe(false)
  }
  await vi.waitFor(idle)
  while (!pager.getState().complete) {
    pager.loadMore()
    await vi.waitFor(idle)
  }
  return pager.getState()
}

/** The list a fresh screen would show, read now. */
async function freshList(filter: TxnFilter) {
  const pager = new TransactionPager(apiLedgerParts)
  pager.attach()
  pager.setFilter(filter)
  return listOf(pager)
}

describe.each([
  ['a ledger held in full', FULL],
  ['a window', WINDOWED],
] as const)('a write the server cascades, with %s', (_config, policy) => {
  it.each([1, 2, 3, 4])('refreshes the list only when patch() says so, and the list then equals a fresh read (order %i)', async (seed) => {
    pinClock('2026-08-20')
    const sqlite = migratedDatabase()
    sqlite.exec('PRAGMA foreign_keys = OFF')
    seedDataset(sqlite, OWNER, source)
    world = createExpenseWorld(sqlite, sqliteD1(sqlite, newStats()))
    vi.stubGlobal('fetch', routeFetch(world))
    const session = new LedgerSession(apiLedgerParts, { policy })
    await session.open()
    const pager = new TransactionPager(apiLedgerParts)
    pager.attach()

    for (const step of shuffled(STEPS, seed)) {
      const filter = step.filter(months)
      pager.setFilter(filter)
      await listOf(pager)
      const patch = await step.write(months)
      applyWrite(session, pager, patch)
      // The session reads the ledger again after a cascade, at the same time as the list.
      await new Promise((resolve) => setTimeout(resolve, 60))
      const shown = await listOf(pager)
      const fresh = await freshList(filter)

      expect(comparable(shown.rows), `${step.name}, order ${seed}`).toEqual(comparable(fresh.rows))
      await vi.waitFor(() => expect(pager.getState().summaryStale).toBe(false))
      expect(pager.getState().summary?.count, `${step.name}, order ${seed}`).toBe(fresh.rows.length)
    }
  }, SLOW)
})
