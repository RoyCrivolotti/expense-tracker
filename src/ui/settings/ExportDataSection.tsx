import { useState } from 'react'
import type { ExpenseModel } from '../useExpenseData'
import { downloadTransactionsCsv } from '../../data/exportCsv'
import styles from '../definitions/definitions.module.css'
import own from './ExportDataSection.module.css'

interface ExportDataProps {
  model: ExpenseModel
  month: string
}

const COUNT = new Intl.NumberFormat()

/**
 * The month is always held, so it is written from the dataset. The whole ledger is too, unless the model holds only a
 * window of it: then every transaction is read from the server first, and the file is the same one a ledger held in
 * full would give.
 */
export function ExportDataSection({ model, month }: ExportDataProps) {
  const [reading, setReading] = useState<number | null>(null)
  const [failed, setFailed] = useState(false)
  const { exportAll } = model

  const exportEverything = () => {
    if (!exportAll) return downloadTransactionsCsv(model.dataset, {})
    setFailed(false)
    setReading(exportAll.count)
    exportAll.read().then(
      (transactions) => downloadTransactionsCsv({ ...model.dataset, transactions }, {}),
      () => setFailed(true),
    ).finally(() => setReading(null))
  }

  return (
    <div>
      <button
        type="button"
        className={styles.addBtn}
        onClick={() => downloadTransactionsCsv(model.dataset, { month })}
      >
        Export {month} to CSV
      </button>
      <button type="button" className={styles.addBtn} disabled={reading !== null} onClick={exportEverything}>
        {reading === null ? 'Export all transactions to CSV' : `Exporting ${COUNT.format(reading)} rows…`}
      </button>
      {failed && (
        <p role="alert" className={own.error}>
          Couldn’t read every transaction, so nothing was saved. Try again once you’re connected.
        </p>
      )}
    </div>
  )
}
