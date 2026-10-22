import type { Env, ExpensesData } from '../../_shared/env'
import { EXPORT_FORMAT, type ExportChunk } from '../../domain/data/exportTables'
import { parseExportRequest, readExport } from '../../domain/application/exportService'
import { readOwnerRevision } from '../../_shared/dbRevision'
import { singleParams } from '../../_shared/ledgerPartParams'
import { mapAppError } from '../../_shared/mapAppError'

/** One row per line, each line complete JSON, and a newline after the last: concatenating chunks stays valid NDJSON. */
function ndjson(chunk: ExportChunk, revision: string): Response {
  const body = chunk.rows.map((row) => `${JSON.stringify(row)}\n`).join('')
  const headers: Record<string, string> = {
    'content-type': 'application/x-ndjson; charset=utf-8',
    'cache-control': 'private, no-store',
    'x-export-table': chunk.table,
    'x-export-format': String(EXPORT_FORMAT),
    'x-export-revision': revision,
  }
  if (chunk.next !== null) headers['x-export-next'] = chunk.next
  return new Response(body, { headers })
}

/**
 * One chunk of one table of the owner's ledger as NDJSON: `?table=<name>&after=<position>&limit=<n>`. Follow
 * `X-Export-Next` as `after` until it is absent to read a table, and do that for every table in `EXPORT_TABLES`
 * to read the ledger. Rows are in primary-key order and are the shapes `loadDataset` carries (a transaction with
 * its derived status and ascending label ids, a check-in with its entries, an attachment as metadata only).
 *
 * `limit` defaults to the table's bound in `EXPORT_CHUNK_ROWS` and a larger one is a 400, never trimmed, so one
 * request stays inside the Free plan's CPU time. A position is the id, a month (`cashActuals`) or
 * `accountId:month` (`accountStatements`); it carries no owner, which comes from the session. A row inserted or
 * deleted between two requests never repeats or hides a row that was there throughout, but a walk is not a
 * snapshot: `X-Export-Revision` is the owner's token read before the rows, so a reader that needs one consistent
 * state compares it across chunks and starts again when it moved.
 *
 * A read: it writes nothing and never moves the revision, and it does not run the installment backfill, so an
 * instalment that has fallen due and not yet been created (a dataset read creates it) is not in an export.
 */
export const onRequestGet: PagesFunction<Env, string, ExpensesData> = async (context) => {
  const { repo, owner } = context.data
  try {
    const request = parseExportRequest(singleParams(new URL(context.request.url), ['table', 'after', 'limit']))
    // Before the rows, as for the other reads: a write in between makes the token older than the data.
    const { token } = await readOwnerRevision(context.env.DB, owner)
    return ndjson(await readExport(repo, owner, request), token)
  } catch (error) {
    mapAppError(error)
  }
}
