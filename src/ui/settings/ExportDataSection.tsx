import type { ExpenseModel } from '../useExpenseData'
import { downloadTransactionsCsv } from '../../data/exportCsv'
import styles from '../definitions/definitions.module.css'

interface ExportDataProps {
  model: ExpenseModel
  month: string
}

export function ExportDataSection({ model, month }: ExportDataProps) {
  return (
    <div>
      <button
        type="button"
        className={styles.addBtn}
        onClick={() => downloadTransactionsCsv(model.dataset, { month })}
      >
        Export {month} to CSV
      </button>
      <button
        type="button"
        className={styles.addBtn}
        onClick={() => downloadTransactionsCsv(model.dataset, {})}
      >
        Export all transactions to CSV
      </button>
    </div>
  )
}
