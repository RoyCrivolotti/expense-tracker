/**
 * The read requests of a measurement run, in order, and the state they carry from one to the next. Reads need
 * nothing from the database but the synthetic owner's rows. The runner is `routeMatrix.ts`.
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
import { onRequestGet as getRecent } from '../../api/expenses/transactions/recent'
import { onRequestGet as getExport } from '../../api/expenses/export'
import { onRequestGet as getOne } from '../../api/expenses/transactions/[id]'
import type { invokePagesRoute } from '../invokePagesRoute'

type Handler = Parameters<typeof invokePagesRoute>[0]

interface Row {
  id: number
  accountId: number
  categoryId: number
}

/** Carried from one case to the next: the tag, the first page's cursor, the export position, rows to edit and rows created. */
export interface State {
  etag: string | null
  cursor: string | null
  exportNext: string | null
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
  request: (
    state: State,
    month: string,
  ) => Request
  /** Reads what the next case needs out of the response. */
  after?: (
    body: unknown,
    response: Response,
    state: State,
  ) => void
}

const get = (
  handler: Handler,
  path: string,
  headers?: Record<string, string>,
): Request => ({
  handler,
  path,
  method: 'GET',
  ...(headers ? { headers } : {}),
})

const range = (
  month: string,
  months: number,
): string => `from=${shiftBudgetMonth(month, -(months - 1))}&to=${month}`

export const READ_CASES: Case[] = [
  {
    name: 'GET /api/expenses',
    writes: false,
    request: () => get(getDataset, ''),
    after: (
      _b,
      r,
      s,
    ) => {
      s.etag = r.headers.get('etag')
    },
  },
  {
    name: 'GET /api/expenses, 304',
    writes: false,
    request: (s) => get(getDataset, '', s.etag ? { 'if-none-match': s.etag } : {}),
  },
  {
    name: 'GET reference',
    writes: false,
    request: () => get(getReference, '/reference'),
    after: (
      b,
      _r,
      s,
    ) => {
      s.otherCategoryId =
        (b as { reference?: { categories?: { id: number }[] } }).reference?.categories?.[1]?.id ?? null
    },
  },
  {
    name: 'GET transactions/months, 3 months',
    writes: false,
    request: (
      _s,
      m,
    ) => get(getMonths, `/transactions/months?${range(m, 3)}`),
  },
  {
    name: 'GET cube, 12 months',
    writes: false,
    request: (
      _s,
      m,
    ) => get(getCube, `/cube?${range(m, 12)}`),
  },
  { name: 'GET series', writes: false, request: () => get(getSeries, '/series') },
  { name: 'GET descriptions/suggest, q=c', writes: false, request: () => get(getSuggest, '/descriptions/suggest?q=c') },
  { name: 'GET usage', writes: false, request: () => get(getUsage, '/usage') },
  {
    name: 'GET transactions/list, first page',
    writes: false,
    request: () => get(getList, '/transactions/list'),
    after: (
      b,
      _r,
      s,
    ) => {
      const page = b as { items?: Row[]; nextCursor?: string | null }
      s.rows = page.items ?? []
      s.cursor = page.nextCursor ?? null
    },
  },
  {
    name: 'GET transactions/list, second page',
    writes: false,
    request: (s) => get(getList, `/transactions/list${s.cursor ? `?cursor=${encodeURIComponent(s.cursor)}` : ''}`),
  },
  {
    name: 'GET transactions/list, one month',
    writes: false,
    request: (
      _s,
      m,
    ) => get(getList, `/transactions/list?month=${m}`),
  },
  { name: 'GET transactions/summary', writes: false, request: () => get(getSummary, '/transactions/summary') },
  {
    name: 'GET transactions/summary, one month',
    writes: false,
    request: (
      _s,
      m,
    ) => get(getSummary, `/transactions/summary?month=${m}`),
  },
  { name: 'GET transactions/recent', writes: false, request: () => get(getRecent, '/transactions/recent') },
  {
    name: 'GET transactions/recent, limit 50',
    writes: false,
    request: () => get(getRecent, '/transactions/recent?limit=50'),
  },
  {
    name: 'GET export, transactions, first 500',
    writes: false,
    request: () => get(getExport, '/export?table=transactions&limit=500'),
    after: (
      _b,
      r,
      s,
    ) => {
      s.exportNext = r.headers.get('x-export-next')
    },
  },
  {
    name: 'GET export, transactions, next 500',
    writes: false,
    request: (s) =>
      get(
        getExport,
        `/export?table=transactions&limit=500${s.exportNext ? `&after=${encodeURIComponent(s.exportNext)}` : ''}`,
      ),
  },
  {
    name: 'GET transactions/:id',
    writes: false,
    request: (s) => ({ ...get(getOne, ''), params: { id: String(s.rows[0]?.id ?? 0) } }),
  },
]
