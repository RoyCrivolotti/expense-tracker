/**
 * The requests a measurement run makes, in order, through the real auth middleware and route handlers over
 * whatever database the caller supplies. Reads come first and need nothing from the database but the
 * synthetic owner's rows; the write cases run last, on rows they create themselves, and only when asked.
 * Each case notes how many D1 calls and statements it made and the rows D1 reported (see `records.ts`).
 */
import type { Env } from '../env'
import { invokePagesRoute } from '../invokePagesRoute'
import { READ_CASES, type Case, type State } from './routeCases'
import { markOf, statementsSince, summarize, type MeasureOptions, type RouteResult } from './records'
import { WRITE_CASES } from './routeWriteCases'

const BASE = 'https://expenses.test/api/expenses'

export function newState(): State {
  return { etag: null, cursor: null, exportNext: null, rows: [], otherCategoryId: null, created: [] }
}

async function runCase(
  options: MeasureOptions,
  state: State,
  item: Case,
): Promise<RouteResult> {
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
  // The export answers in NDJSON, which is not one JSON document.
  const isJson = response.headers.get('content-type')?.startsWith('application/json') ?? false
  const body: unknown = text && isJson ? (JSON.parse(text) as unknown) : null
  item.after?.(body, response, state)
  const summary = summarize(recorder, mark)
  return {
    name: item.name,
    status: response.status,
    bytes: new TextEncoder().encode(text).length,
    summary,
    statements: statementsSince(recorder, mark),
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
