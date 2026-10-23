import { useCallback, useState } from 'react'
import type { ParseExportResult } from '../../domain/data/parseExportCsv'
import type { ExpenseActions } from '../actions'
import { useToast } from '../hooks/useToast'
import { ImportStopped, importInChunks } from './importInChunks'

/**
 * Importing the rows of a parsed file in requests a server can run. One that stops part of the way leaves `result` with
 * the rows not saved, so that confirming again sends only those, and says how far it got.
 */
export function useImportRows(
  actions: ExpenseActions,
  result: ParseExportResult | null,
  setResult: (next: ParseExportResult | null) => void,
) {
  const { showToast } = useToast()
  const [busy, setBusy] = useState(false)
  /** Rows of the import under way that are saved. */
  const [progress, setProgress] = useState(0)
  const [done, setDone] = useState<string | null>(null)
  const [stopped, setStopped] = useState<string | null>(null)
  /** Rows of this file saved by imports that stopped, which the rows left are not. */
  const [earlier, setEarlier] = useState(0)

  const clear = useCallback(() => {
    setDone(null)
    setStopped(null)
    setEarlier(0)
  }, [])

  const confirm = useCallback(async () => {
    if (!result || result.rows.length === 0) return
    const rows = result.rows
    setBusy(true)
    setProgress(0)
    setStopped(null)
    try {
      await importInChunks(rows.map((row) => row.input), actions.createTransactions, { onProgress: setProgress })
      const message = earlier === 0 ? `Imported ${rows.length} transactions` : `Imported the last ${rows.length} transactions, ${rows.length + earlier} in all`
      setDone(message)
      setEarlier(0)
      setResult(null)
      showToast(message, 'success')
    } catch (error) {
      if (error instanceof ImportStopped) {
        setResult({ ...result, rows: rows.slice(error.imported) })
        setEarlier(earlier + error.imported)
        setStopped(error.message)
        // What happened and what to do is on the page, where it stays; the toast only says that it stopped.
        showToast(`Import stopped: ${error.imported} of ${rows.length} imported`, 'error')
      } else {
        showToast(error instanceof Error ? error.message : 'Import failed', 'error')
      }
    } finally {
      setBusy(false)
    }
  }, [actions, earlier, result, setResult, showToast])

  return { busy, progress, done, stopped, confirm, clear }
}
