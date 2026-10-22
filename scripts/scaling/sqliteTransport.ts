/**
 * A Transport over node:sqlite, so everything built on it (seeding, the adapter, cleanup, the route matrix)
 * runs in tests against the real migrations without Cloudflare. It cannot reproduce D1's billing: it reports
 * the rows a statement returned as read and the rows it changed as written, which is enough to exercise the
 * caps and the plumbing. It does enforce D1's limit of 100 bound parameters.
 */
import type { DatabaseSync, SQLInputValue } from 'node:sqlite'
import { D1_MAX_BOUND_PARAMETERS } from '../../src/testing/sqliteD1'
import type { D1Reply, Statement, Transport } from './transport'

const RETURNS_ROWS = /^\s*(select|with|pragma|explain)\b|\breturning\b/i

export interface RecordingTransport extends Transport {
  /** Every statement sent, in order, batches flattened. */
  sent: Statement[]
}

function reply(results: Record<string, unknown>[], changes: number): D1Reply {
  return {
    results,
    success: true,
    meta: { rows_read: results.length, rows_written: changes, duration: 0, changes },
  }
}

export function sqliteTransport(db: DatabaseSync): RecordingTransport {
  const sent: Statement[] = []
  const run = (statement: Statement): D1Reply => {
    sent.push(statement)
    if (statement.params.length > D1_MAX_BOUND_PARAMETERS) {
      throw new Error(`too many SQL variables: ${statement.params.length}`)
    }
    const prepared = db.prepare(statement.sql)
    const params = statement.params as SQLInputValue[]
    if (RETURNS_ROWS.test(statement.sql)) {
      const rows = prepared.all(...params) as Record<string, unknown>[]
      const changes = Number((db.prepare('SELECT changes() AS c').get() as { c: number }).c)
      return reply(rows, /^\s*(select|with|pragma|explain)\b/i.test(statement.sql) ? 0 : changes)
    }
    return reply([], Number(prepared.run(...params).changes))
  }
  return {
    sent,
    query: (statement) => Promise.resolve().then(() => run(statement)),
    batch: (statements) =>
      Promise.resolve().then(() => {
        db.exec('BEGIN')
        try {
          const replies = statements.map(run)
          db.exec('COMMIT')
          return replies
        } catch (error) {
          db.exec('ROLLBACK')
          throw error
        }
      }),
  }
}
