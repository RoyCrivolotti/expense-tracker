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
 * One chunk of one table of the owner's ledger as NDJSON (docs/SCALING.md, "Export"). Follow `X-Export-Next`
 * as `after` until it is absent to read a table; do that for every table to read the ledger. A read: it
 * writes nothing and never moves the revision, and it does not run the installment backfill.
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
