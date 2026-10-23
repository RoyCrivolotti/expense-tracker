import { ApiError } from '../../data/apiClient'

/**
 * Rows a request of an import carries. A create runs six statements a row and four more a request, so a thousand rows in
 * one request is six thousand statements; a hundred is about six hundred, which D1 has been run at.
 */
export const IMPORT_CHUNK = 100

/** An import that stopped after some requests were done: `imported` rows are saved, and the others are the caller's still. */
export class ImportStopped extends Error {
  /** How many rows are saved. */
  readonly imported: number
  /** True when the request that failed may have been saved: it was refused by nothing the server said. */
  readonly maybeSaved: boolean

  constructor(message: string, imported: number, maybeSaved: boolean, options: ErrorOptions) {
    super(message, options)
    this.name = 'ImportStopped'
    this.imported = imported
    this.maybeSaved = maybeSaved
  }
}

const count = (n: number): string => n.toLocaleString('en-US')

/**
 * What the person is told when a request after the first fails. A row the server names is named by its place in the
 * whole import, not in the request, and whether the rows of that request may be saved depends on what answered: a
 * refusal (a 4xx) wrote nothing, anything else may have.
 */
function stoppedAt(error: unknown, imported: number, total: number, sent: number): ImportStopped {
  const reason = error instanceof Error ? error.message : String(error)
  const refused = error instanceof ApiError && error.status >= 400 && error.status < 500
  const left = total - imported
  const named = reason.replace(/\bRow (\d+)\b/g, (_, row: string) => `Row ${Number(row) + imported}`)
  const message = refused
    ? `Imported ${count(imported)} of ${count(total)} transactions. The next ${count(sent)} were refused and not saved: ${named}. The ${count(left)} left are still here: fix the cause and confirm again.`
    : `Imported ${count(imported)} of ${count(total)} transactions. The next ${count(sent)} may or may not have been saved (${reason}). Look in Transactions before you confirm again for the ${count(left)} left, or those ${count(sent)} may be there twice.`
  return new ImportStopped(message, imported, !refused, { cause: error })
}

/**
 * `rows` in requests of at most `size`, one after the other. The first request failing is the error it was, as for any
 * import that is one request. A later one stops the import with an {@link ImportStopped} that says how far it got,
 * because the requests before it are saved.
 */
export async function importInChunks<T>(
  rows: readonly T[],
  send: (chunk: T[]) => Promise<void>,
  options: { size?: number; onProgress?: (imported: number) => void } = {},
): Promise<void> {
  const size = options.size ?? IMPORT_CHUNK
  for (let at = 0; at < rows.length; at += size) {
    const chunk = rows.slice(at, at + size)
    try {
      await send(chunk)
    } catch (error) {
      if (at === 0) throw error
      throw stoppedAt(error, at, rows.length, chunk.length)
    }
    options.onProgress?.(at + chunk.length)
  }
}
