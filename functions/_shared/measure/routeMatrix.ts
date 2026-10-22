/**
 * The requests a measurement run makes, in order, through the real auth middleware and route handlers over
 * whatever database the caller supplies. Reads come first and need nothing from the database but the
 * synthetic owner's rows; the write cases run last, on rows they create themselves, and only when asked.
 * Each case notes how many D1 calls and statements it made and the rows D1 reported (see `records.ts`).
 */
import { shiftBudgetMonth } from '../../domain/engine/dates'
import { onRequestGet as getDataset } from '../../api/expenses/index'
import { onRequestGet as getReference } from '../../api/expenses/reference'
import { onRequestGet as getMonths } from '../../api/expenses/transactions/months'
import { onRequestGet as getCube } from '../../api/expenses/cube'
import { onRequestGet as getSeries } from '../../api/expenses/series'
import { onRequestGet as getSuggest } from '../../api/expenses/descriptions/suggest'
import { onRequestGet as getUsage } from '../../api/expenses/usage'
import { onRequestGet as getList } from '../../api/expenses/transactions/list'
import { onRequestGet as getSummary } from '../../api/expenses/transactions/summary'
import { onRequestGet as getOne, onRequestDelete as deleteOne } from '../../api/expenses/transactions/[id]'
import { onRequestPost as postOne } from '../../api/expenses/transactions/index'
import {
  onRequestDelete as deleteBulk,
  onRequestPatch as patchBulk,
  onRequestPost as postBulk,
} from '../../api/expenses/transactions/bulk'
import type { Env } from '../env'
import { invokePagesRoute } from '../invokePagesRoute'
import { markOf, summarize, type MeasureOptions, type RouteResult } from './records'

const BASE = 'https://expenses.test/api/expenses'

type Handler = Parameters<typeof invokePagesRoute>[0]

interface Row {
  id: number
  accountId: number
  categoryId: number
}

/** Carried from one case to the next: the tag, the first page's cursor, rows to edit and rows created. */
export interface State {
  etag: string | null
  cursor: string | null
  rows: Row[]
  otherCategoryId: number | null
  created: number[]
}

interface Request {
  handler: Handler
  path?: string
  method?: string
  body?: unknown
  params?: Record<string, string>
  headers?: Record<string, string>
}

export interface Case {
  name: string
  /** Whether the route writes by design. A read that writes is flagged in the result. */
  writes: boolean
  request: (state: State, month: string) => Request
  /** Reads what the next case needs out of the response. */
  after?: (body: unknown, response: Response, state: State) => void
}

const get = (handler: Handler, path: string, headers?: Record<string, string>): Request => ({
  handler,
  path,
  method: 'GET',
  ...(headers ? { headers } : {}),
})

const range = (month: string, months: number): string =>
  `from=${shiftBudgetMonth(month, -(months - 1))}&to=${month}`

const today = (): string => new Date().toISOString().slice(0, 10)

const fresh = (state: State, month: string, descriptions: string[]) => ({
  date: today(),
  budgetMonth: month,
  accountId: state.rows[0]?.accountId,
  categoryId: state.rows[0]?.categoryId,
  type: 'expense',
  amountCents: 1234,
  description: descriptions[0] ?? 'Measurement row',
})

export const READ_CASES: Case[] = [
  { name: 'GET /api/expenses', writes: false, request: () => get(getDataset, ''), after: (_b, r, s) => { s.etag = r.headers.get('etag') } },
  { name: 'GET /api/expenses, 304', writes: false, request: (s) => get(getDataset, '', s.etag ? { 'if-none-match': s.etag } : {}) },
  { name: 'GET reference', writes: false, request: () => get(getReference, '/reference'), after: (b, _r, s) => { s.otherCategoryId = (b as { reference?: { categories?: { id: number }[] } }).reference?.categories?.[1]?.id ?? null } },
  { name: 'GET transactions/months, 3 months', writes: false, request: (_s, m) => get(getMonths, `/transactions/months?${range(m, 3)}`) },
  { name: 'GET cube, 12 months', writes: false, request: (_s, m) => get(getCube, `/cube?${range(m, 12)}`) },
  { name: 'GET series', writes: false, request: () => get(getSeries, '/series') },
  { name: 'GET descriptions/suggest, q=c', writes: false, request: () => get(getSuggest, '/descriptions/suggest?q=c') },
  { name: 'GET usage', writes: false, request: () => get(getUsage, '/usage') },
  { name: 'GET transactions/list, first page', writes: false, request: () => get(getList, '/transactions/list'), after: (b, _r, s) => { const page = b as { items?: Row[]; nextCursor?: string | null }; s.rows = page.items ?? []; s.cursor = page.nextCursor ?? null } },
  { name: 'GET transactions/list, second page', writes: false, request: (s) => get(getList, `/transactions/list${s.cursor ? `?cursor=${encodeURIComponent(s.cursor)}` : ''}`) },
  { name: 'GET transactions/list, one month', writes: false, request: (_s, m) => get(getList, `/transactions/list?month=${m}`) },
  { name: 'GET transactions/summary', writes: false, request: () => get(getSummary, '/transactions/summary') },
  { name: 'GET transactions/summary, one month', writes: false, request: (_s, m) => get(getSummary, `/transactions/summary?month=${m}`) },
  { name: 'GET transactions/:id', writes: false, request: (s) => ({ ...get(getOne, ''), params: { id: String(s.rows[0]?.id ?? 0) } }) },
]

export const WRITE_CASES: Case[] = [
  { name: 'POST transactions, one row', writes: true, request: (s, m) => ({ handler: postOne, method: 'POST', path: '/transactions', body: fresh(s, m, ['Measurement single']) }), after: (b, _r, s) => { s.created.unshift(Number((b as { id?: number }).id)) } },
  { name: 'POST transactions/bulk, 20 rows', writes: true, request: (s, m) => ({ handler: postBulk, method: 'POST', path: '/transactions/bulk', body: { transactions: Array.from({ length: 20 }, (_, i) => fresh(s, m, [`Measurement bulk ${i}`])) } }), after: (b, _r, s) => { s.created.push(...((b as { transactions?: { id: number }[] }).transactions ?? []).map((t) => t.id)) } },
  { name: 'PATCH transactions/bulk, 50 rows', writes: true, request: (s) => ({ handler: patchBulk, method: 'PATCH', path: '/transactions/bulk', body: { ids: s.rows.slice(0, 50).map((r) => r.id), patch: { categoryId: s.otherCategoryId } } }) },
  { name: 'DELETE transactions/bulk, 20 rows', writes: true, request: (s) => ({ handler: deleteBulk, method: 'DELETE', path: '/transactions/bulk', body: { ids: s.created.slice(1) } }) },
  { name: 'DELETE transactions/:id', writes: true, request: (s) => ({ handler: deleteOne, method: 'DELETE', path: '', params: { id: String(s.created[0] ?? 0) } }) },
]

export function newState(): State {
  return { etag: null, cursor: null, rows: [], otherCategoryId: null, created: [] }
}

async function runCase(options: MeasureOptions, state: State, item: Case): Promise<RouteResult> {
  const { db, recorder, owner, month } = options
  const request = item.request(state, month)
  const env: Env = { DB: db, ALLOWED_EMAILS: owner, ALLOW_BOOTSTRAP: '1' }
  const mark = markOf(recorder)
  const response = await invokePagesRoute(request.handler, {
    env,
    email: owner,
    method: request.method ?? 'GET',
    url: `${BASE}${request.path ?? ''}`,
    ...(request.body === undefined ? {} : { body: request.body }),
    ...(request.params ? { params: request.params } : {}),
    ...(request.headers ? { headers: request.headers } : {}),
  })
  const text = await response.text()
  const body: unknown = text ? (JSON.parse(text) as unknown) : null
  item.after?.(body, response, state)
  const summary = summarize(recorder, mark)
  return {
    name: item.name,
    status: response.status,
    bytes: new TextEncoder().encode(text).length,
    summary,
    unexpectedWrite: !item.writes && summary.rowsWritten > 0,
  }
}

/**
 * Runs the read cases, then the write cases when `includeWrites`. A case that answers with an error stops
 * the run: later cases lean on what earlier ones returned, and a failure is the finding.
 */
export async function measureRoutes(options: MeasureOptions): Promise<RouteResult[]> {
  const state = newState()
  const cases = options.includeWrites ? [...READ_CASES, ...WRITE_CASES] : READ_CASES
  const results: RouteResult[] = []
  for (const item of cases) {
    const result = await runCase(options, state, item)
    results.push(result)
    if (result.status >= 400) break
  }
  return results
}
