/**
 * Talks to one D1 database over Cloudflare's REST API, which reports `meta.rows_read` and
 * `meta.rows_written` for every statement. The token comes from the caller (the command line reads it from
 * the environment) and is only ever put in the Authorization header: no error, log line or return value
 * carries it. A REST call is not a Worker invocation, so it shows nothing about the 50 queries a Worker may
 * issue or about CPU.
 */
import type { Meta } from './spend'

export interface Statement {
  sql: string
  params: unknown[]
}

export interface D1Reply {
  results: Record<string, unknown>[]
  success: boolean
  meta: Meta & { changes?: number }
}

/** What the adapter and the seeding code need from a database, whether it is REST or a test stand-in. */
export interface Transport {
  query(statement: Statement): Promise<D1Reply>
  /** Runs the statements as one transaction, in order, and answers once per statement. */
  batch(statements: Statement[]): Promise<D1Reply[]>
}

export interface RestOptions {
  accountId: string
  databaseId: string
  token: string
  fetchImpl?: typeof fetch
}

const API = 'https://api.cloudflare.com/client/v4'

interface Envelope<T> {
  success?: boolean
  errors?: { message?: string }[]
  result?: T
  data?: unknown
}

async function call<T>(
  fetchImpl: typeof fetch,
  token: string,
  url: string,
  init: { method: string; body?: unknown },
): Promise<Envelope<T>> {
  const response = await fetchImpl(url, {
    method: init.method,
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    ...(init.body === undefined ? {} : { body: JSON.stringify(init.body) }),
  })
  const text = await response.text()
  let body: Envelope<T>
  try {
    body = JSON.parse(text) as Envelope<T>
  } catch {
    throw new Error(`Cloudflare answered ${response.status} with something that is not JSON`)
  }
  if (!response.ok || body.success === false || (body.errors?.length ?? 0) > 0) {
    const reasons = (body.errors ?? []).map((e) => e.message ?? 'unknown error').join('; ')
    throw new Error(`Cloudflare answered ${response.status}: ${reasons || 'no reason given'}`)
  }
  return body
}

interface RawReply {
  results?: Record<string, unknown>[]
  success?: boolean
  meta?: Record<string, number | undefined>
}

function toReply(raw: RawReply): D1Reply {
  const meta = raw.meta ?? {}
  const duration = meta.duration ?? meta.sql_duration_ms
  return {
    results: raw.results ?? [],
    success: raw.success !== false,
    meta: {
      rows_read: meta.rows_read ?? 0,
      rows_written: meta.rows_written ?? 0,
      ...(duration === undefined ? {} : { duration }),
      ...(meta.changes === undefined ? {} : { changes: meta.changes }),
    },
  }
}

export function restTransport(options: RestOptions): Transport {
  const fetchImpl = options.fetchImpl ?? fetch
  const url = `${API}/accounts/${options.accountId}/d1/database/${options.databaseId}/query`
  const send = async (body: unknown): Promise<D1Reply[]> => {
    const envelope = await call<RawReply[]>(fetchImpl, options.token, url, { method: 'POST', body })
    return (envelope.result ?? []).map(toReply)
  }
  return {
    async query(statement) {
      const [reply] = await send({ sql: statement.sql, params: statement.params })
      if (!reply) throw new Error('Cloudflare answered with no result for a statement')
      return reply
    },
    async batch(statements) {
      const replies = await send({ batch: statements.map((s) => ({ sql: s.sql, params: s.params })) })
      if (replies.length !== statements.length) {
        throw new Error(`A batch of ${statements.length} statements got ${replies.length} results`)
      }
      return replies
    },
  }
}

/** What Cloudflare calls the database: used to check the id in config/dev.json is the one named there. */
export async function describeDatabase(
  options: RestOptions,
): Promise<{ uuid: string; name: string }> {
  const url = `${API}/accounts/${options.accountId}/d1/database/${options.databaseId}`
  const envelope = await call<{ uuid?: string; name?: string }>(options.fetchImpl ?? fetch, options.token, url, {
    method: 'GET',
  })
  const { uuid, name } = envelope.result ?? {}
  if (!uuid || !name) throw new Error('Cloudflare did not say which database this is')
  return { uuid, name }
}

export interface AccountUsage {
  rowsRead: number
  rowsWritten: number
  /** Per database id, so the report can show how much of it is the development database. */
  byDatabase: Record<string, { rowsRead: number; rowsWritten: number }>
}

const USAGE_QUERY = `query D1Usage($accountTag: string!, $day: Date!) {
  viewer { accounts(filter: { accountTag: $accountTag }) {
    d1AnalyticsAdaptiveGroups(limit: 100, filter: { date_geq: $day, date_leq: $day }) {
      sum { rowsRead rowsWritten } dimensions { databaseId }
    } } } }`

interface UsageGroup {
  sum?: { rowsRead?: number; rowsWritten?: number }
  dimensions?: { databaseId?: string }
}

function addGroup(usage: AccountUsage, group: UsageGroup): void {
  const rowsRead = group.sum?.rowsRead ?? 0
  const rowsWritten = group.sum?.rowsWritten ?? 0
  usage.rowsRead += rowsRead
  usage.rowsWritten += rowsWritten
  const id = group.dimensions?.databaseId ?? 'unknown'
  const seen = usage.byDatabase[id] ?? { rowsRead: 0, rowsWritten: 0 }
  usage.byDatabase[id] = { rowsRead: seen.rowsRead + rowsRead, rowsWritten: seen.rowsWritten + rowsWritten }
}

/** Rows read and written today by every D1 database in the account, from the GraphQL analytics API. */
export async function accountUsageOn(options: Omit<RestOptions, 'databaseId'>, day: string): Promise<AccountUsage> {
  const envelope = await call<unknown>(options.fetchImpl ?? fetch, options.token, `${API}/graphql`, {
    method: 'POST',
    body: { query: USAGE_QUERY, variables: { accountTag: options.accountId, day } },
  })
  const data = envelope.data as { viewer?: { accounts?: { d1AnalyticsAdaptiveGroups?: UsageGroup[] }[] } } | undefined
  const groups = data?.viewer?.accounts?.[0]?.d1AnalyticsAdaptiveGroups
  if (!groups) throw new Error('Cloudflare analytics returned no D1 usage (does the token allow Account Analytics: Read?)')
  const usage: AccountUsage = { rowsRead: 0, rowsWritten: 0, byDatabase: {} }
  for (const group of groups) addGroup(usage, group)
  return usage
}
