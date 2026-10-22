// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { accountUsageOn, describeDatabase, restTransport } from './transport'

const TOKEN = 'secret-token-value'
const OPTIONS = { accountId: 'acct', databaseId: 'db-1', token: TOKEN }

interface Call {
  url: string
  init: RequestInit
  /** The request body, which the transport always sends as a JSON string. */
  body: string
}

function fakeFetch(reply: unknown, status = 200): { fetchImpl: typeof fetch; calls: Call[] } {
  const calls: Call[] = []
  const fetchImpl = ((url: string, init: RequestInit) => {
    calls.push({ url, init, body: typeof init.body === 'string' ? init.body : '' })
    const body = typeof reply === 'string' ? reply : JSON.stringify(reply)
    return Promise.resolve(new Response(body, { status }))
  }) as typeof fetch
  return { fetchImpl, calls }
}

const ok = (result: unknown) => ({ success: true, errors: [], result })

describe('querying over REST', () => {
  it('posts the statement and its parameters, and reads the rows D1 reports', async () => {
    const { fetchImpl, calls } = fakeFetch(
      ok([{ results: [{ n: 3 }], success: true, meta: { rows_read: 3, rows_written: 0, duration: 0.4, changes: 0 } }]),
    )
    const reply = await restTransport({ ...OPTIONS, fetchImpl }).query({ sql: 'SELECT ?', params: [1] })
    expect(reply.results).toEqual([{ n: 3 }])
    expect(reply.meta).toEqual({ rows_read: 3, rows_written: 0, duration: 0.4, changes: 0 })
    expect(calls[0]?.url).toBe('https://api.cloudflare.com/client/v4/accounts/acct/d1/database/db-1/query')
    expect(JSON.parse(calls[0]?.body ?? '')).toEqual({ sql: 'SELECT ?', params: [1] })
    expect(calls[0]?.init.method).toBe('POST')
  })

  it('sends the token only as the Authorization header', async () => {
    const { fetchImpl, calls } = fakeFetch(ok([{ results: [], success: true, meta: {} }]))
    await restTransport({ ...OPTIONS, fetchImpl }).query({ sql: 'SELECT 1', params: [] })
    const init = calls[0]?.init
    expect((init?.headers as Record<string, string>).authorization).toBe(`Bearer ${TOKEN}`)
    expect(calls[0]?.body).not.toContain(TOKEN)
    expect(calls[0]?.url).not.toContain(TOKEN)
  })

  it('reads sql_duration_ms when duration is absent, and zero rows when none are reported', async () => {
    const { fetchImpl } = fakeFetch(ok([{ results: [], meta: { sql_duration_ms: 1.5 } }]))
    const reply = await restTransport({ ...OPTIONS, fetchImpl }).query({ sql: 'SELECT 1', params: [] })
    expect(reply.meta).toEqual({ rows_read: 0, rows_written: 0, duration: 1.5 })
  })

  it('sends a batch as one request and answers once per statement', async () => {
    const one = { results: [], success: true, meta: { rows_read: 1 } }
    const { fetchImpl, calls } = fakeFetch(ok([one, one]))
    const replies = await restTransport({ ...OPTIONS, fetchImpl }).batch([
      { sql: 'SELECT 1', params: [] },
      { sql: 'SELECT 2', params: [] },
    ])
    expect(replies).toHaveLength(2)
    expect(calls).toHaveLength(1)
    expect(JSON.parse(calls[0]?.body ?? '')).toEqual({ batch: [{ sql: 'SELECT 1', params: [] }, { sql: 'SELECT 2', params: [] }] })
  })

  it('refuses a batch that comes back short', async () => {
    const { fetchImpl } = fakeFetch(ok([{ results: [], meta: {} }]))
    await expect(
      restTransport({ ...OPTIONS, fetchImpl }).batch([{ sql: 'SELECT 1', params: [] }, { sql: 'SELECT 2', params: [] }]),
    ).rejects.toThrow(/2 statements got 1/)
  })

  it('reports Cloudflare errors without the token', async () => {
    const { fetchImpl } = fakeFetch({ success: false, errors: [{ message: 'daily limit exceeded' }] }, 400)
    const failure = restTransport({ ...OPTIONS, fetchImpl }).query({ sql: 'SELECT 1', params: [] })
    await expect(failure).rejects.toThrow(/400: daily limit exceeded/)
    await expect(failure).rejects.not.toThrow(TOKEN)
  })

  it('says so when the answer is not JSON, and when a statement gets no result', async () => {
    await expect(restTransport({ ...OPTIONS, fetchImpl: fakeFetch('<html>', 502).fetchImpl }).query({ sql: 'SELECT 1', params: [] })).rejects.toThrow(/not JSON/)
    await expect(restTransport({ ...OPTIONS, fetchImpl: fakeFetch(ok([])).fetchImpl }).query({ sql: 'SELECT 1', params: [] })).rejects.toThrow(/no result/)
  })

  it('reports an error with no message and no list of errors', async () => {
    const { fetchImpl } = fakeFetch({ success: false }, 500)
    await expect(restTransport({ ...OPTIONS, fetchImpl }).query({ sql: 'SELECT 1', params: [] })).rejects.toThrow(/no reason given/)
    const odd = fakeFetch({ success: false, errors: [{}] }, 500).fetchImpl
    await expect(restTransport({ ...OPTIONS, fetchImpl: odd }).query({ sql: 'SELECT 1', params: [] })).rejects.toThrow(/unknown error/)
  })
})

describe('asking what a database is', () => {
  it('reads its id and name', async () => {
    const { fetchImpl, calls } = fakeFetch(ok({ uuid: 'db-1', name: 'roy-expenses-dev', extra: 1 }))
    expect(await describeDatabase({ ...OPTIONS, fetchImpl })).toEqual({ uuid: 'db-1', name: 'roy-expenses-dev' })
    expect(calls[0]?.init.method).toBe('GET')
    expect(calls[0]?.body).toBe('')
  })

  it('refuses an answer that names no database', async () => {
    await expect(describeDatabase({ ...OPTIONS, fetchImpl: fakeFetch(ok({})).fetchImpl })).rejects.toThrow(/which database/)
  })
})

describe('the account usage today', () => {
  const group = (id: string, rowsRead: number, rowsWritten: number) => ({ sum: { rowsRead, rowsWritten }, dimensions: { databaseId: id } })

  it('adds up every database in the account, and keeps them apart', async () => {
    const { fetchImpl, calls } = fakeFetch({ data: { viewer: { accounts: [{ d1AnalyticsAdaptiveGroups: [group('a', 10, 2), group('b', 5, 1), group('a', 1, 1)] }] } } })
    const usage = await accountUsageOn({ accountId: 'acct', token: TOKEN, fetchImpl }, '2026-10-19')
    expect(usage.rowsRead).toBe(16)
    expect(usage.rowsWritten).toBe(4)
    expect(usage.byDatabase).toEqual({ a: { rowsRead: 11, rowsWritten: 3 }, b: { rowsRead: 5, rowsWritten: 1 } })
    const body = JSON.parse(calls[0]?.body ?? '') as { variables: unknown }
    expect(body.variables).toEqual({ accountTag: 'acct', day: '2026-10-19' })
    expect(calls[0]?.url).toBe('https://api.cloudflare.com/client/v4/graphql')
  })

  it('counts a group with no figures as zero and an unnamed database as unknown', async () => {
    const { fetchImpl } = fakeFetch({ data: { viewer: { accounts: [{ d1AnalyticsAdaptiveGroups: [{}] }] } } })
    const usage = await accountUsageOn({ accountId: 'acct', token: TOKEN, fetchImpl }, '2026-10-19')
    expect(usage.byDatabase).toEqual({ unknown: { rowsRead: 0, rowsWritten: 0 } })
  })

  it('explains when the token cannot read analytics', async () => {
    const { fetchImpl } = fakeFetch({ data: null, errors: null })
    await expect(accountUsageOn({ accountId: 'acct', token: TOKEN, fetchImpl }, '2026-10-19')).rejects.toThrow(/Account Analytics: Read/)
  })
})
