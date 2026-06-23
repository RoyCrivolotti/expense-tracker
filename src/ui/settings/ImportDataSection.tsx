import { useCallback, useRef, useState } from 'react'
import type { ExpenseModel } from '../useExpenseData'
import type { ExpenseActions } from '../actions'
import { parseExportCsv, type ParseExportResult } from '../../domain/data/parseExportCsv'
import { Money } from '../components/Money'
import styles from '../definitions/definitions.module.css'
import importStyles from './ImportDataSection.module.css'

interface ImportDataSectionProps {
  model: ExpenseModel
  actions: ExpenseActions
}

function PreviewTable({ result }: { result: ParseExportResult }) {
  if (result.rows.length === 0) return null
  return (
    <div className={importStyles.previewWrap}>
      <table className={importStyles.preview}>
        <thead>
          <tr>
            <th>Date</th>
            <th>Description</th>
            <th>Amount</th>
          </tr>
        </thead>
        <tbody>
          {result.rows.slice(0, 8).map((row) => (
            <tr key={row.line}>
              <td>{row.input.date}</td>
              <td>{row.input.description || '—'}</td>
              <td>
                <Money cents={row.input.amountCents} type={row.input.type} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {result.rows.length > 8 && (
        <p className={importStyles.more}>+ {result.rows.length - 8} more rows</p>
      )}
    </div>
  )
}

export function ImportDataSection({ model, actions }: ImportDataSectionProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [result, setResult] = useState<ParseExportResult | null>(null)
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState<string | null>(null)

  const onFile = useCallback(
    async (file: File) => {
      setDone(null)
      const text = await file.text()
      setResult(parseExportCsv(text, model.dataset))
    },
    [model.dataset],
  )

  const onConfirm = useCallback(async () => {
    if (!result || result.rows.length === 0) return
    setBusy(true)
    try {
      await actions.createTransactions(result.rows.map((r) => r.input))
      setDone(`Imported ${result.rows.length} transactions`)
      setResult(null)
    } finally {
      setBusy(false)
    }
  }, [actions, result])

  return (
    <div className={importStyles.root}>
      <input
        ref={inputRef}
        type="file"
        accept=".csv,text/csv"
        className={importStyles.fileInput}
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) void onFile(file)
          e.target.value = ''
        }}
      />
      <button type="button" className={styles.addBtn} onClick={() => inputRef.current?.click()}>
        Choose CSV file
      </button>
      {result && (
        <>
          <p className={importStyles.summary}>
            {result.rows.length} rows ready
            {result.errors.length > 0 ? ` · ${result.errors.length} skipped` : ''}
          </p>
          {result.errors.length > 0 && (
            <ul className={importStyles.errors}>
              {result.errors.slice(0, 4).map((err) => (
                <li key={err.line}>
                  Line {err.line}: {err.message}
                </li>
              ))}
            </ul>
          )}
          <PreviewTable result={result} />
          <button
            type="button"
            className={styles.addBtn}
            disabled={busy || result.rows.length === 0}
            onClick={() => void onConfirm()}
          >
            {busy ? 'Importing…' : 'Confirm import'}
          </button>
        </>
      )}
      {done && <p className={importStyles.done}>{done}</p>}
    </div>
  )
}
