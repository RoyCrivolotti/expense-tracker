/**
 * A `D1Database` that runs every statement through a Transport (REST in a real run, SQLite in tests), so the
 * repository's own route handlers can be driven unchanged. Each statement passes the write guard first,
 * is charged to the spend ledger when it answers, and is recorded with the rows D1 reported. Only the
 * methods the app calls exist: `prepare`, `bind`, `first`, `all`, `run` and `batch`.
 */
import type { D1Database } from '@cloudflare/workers-types'
import { newRecorder, type Recorder } from '../../functions/_shared/measure/records'
import { assertStatementAllowed, classifyStatement } from './guard'
import type { SpendLedger } from './spend'
import type { D1Reply, Statement, Transport } from './transport'

export interface AdapterOptions {
  transport: Transport
  ledger: SpendLedger
  writesEnabled: boolean
  /** Checked before every statement; return true to abort the run. */
  shouldStop?: () => boolean
}

export interface MeasuredDb {
  db: D1Database
  recorder: Recorder
}

interface Bound extends Statement {
  bind(...values: unknown[]): Bound
  first(column?: string): Promise<unknown>
  all(): Promise<D1Reply>
  run(): Promise<D1Reply>
}

export function measuredDb(options: AdapterOptions): MeasuredDb {
  const { transport, ledger, writesEnabled, shouldStop } = options
  const recorder = newRecorder()

  const admit = (statement: Statement): void => {
    if (shouldStop?.()) throw new Error('Stopped: the stop file is present')
    assertStatementAllowed(statement.sql, statement.params, writesEnabled)
  }
  const note = (statement: Statement, reply: D1Reply, batch: boolean): void => {
    ledger.record(reply.meta)
    recorder.records.push({
      sql: statement.sql,
      rowsRead: reply.meta.rows_read ?? 0,
      rowsWritten: reply.meta.rows_written ?? 0,
      durationMs: reply.meta.duration ?? 0,
      batch,
      write: classifyStatement(statement.sql) !== 'read',
    })
  }
  const send = async (statement: Statement): Promise<D1Reply> => {
    admit(statement)
    const reply = await transport.query(statement)
    recorder.calls += 1
    note(statement, reply, false)
    return reply
  }

  const statement = (sql: string, params: unknown[]): Bound => ({
    sql,
    params,
    bind: (...values) => statement(sql, values),
    first: async (column) => {
      const row = (await send({ sql, params })).results[0]
      if (row === undefined) return null
      return column === undefined ? row : (row[column] ?? null)
    },
    all: () => send({ sql, params }),
    run: async () => ({ ...(await send({ sql, params })), results: [] }),
  })

  const db = {
    prepare: (sql: string) => statement(sql, []),
    batch: async (statements: Bound[]) => {
      const sent = statements.map((s) => ({ sql: s.sql, params: s.params }))
      sent.forEach(admit)
      ledger.assertWithin()
      const replies = await transport.batch(sent)
      recorder.calls += 1
      replies.forEach((reply, i) => note(sent[i] ?? { sql: '', params: [] }, reply, true))
      return replies
    },
  }
  return { db: db as unknown as D1Database, recorder }
}
