import type { ReactNode } from 'react'
import { fullMonthLabel } from '../../engine'
import styles from './analytics.module.css'

export interface LedgerColumn<R> {
  label: string
  value: (row: R) => ReactNode
  cls?: (row: R) => string | undefined
}

interface LedgerTableProps<R extends { month: string }> {
  rows: R[]
  columns: LedgerColumn<R>[]
  /** Footer total cells, aligned to `columns`; omit for no totals row. */
  totals?: ReactNode[]
}

/** Generic month-indexed table (month rows, metric columns) with sticky header. */
export function LedgerTable<R extends { month: string }>({
  rows,
  columns,
  totals,
}: LedgerTableProps<R>) {
  return (
    <div className={styles.scroll}>
      <table className={styles.table}>
        <thead>
          <tr>
            <th>Month</th>
            {columns.map((c) => (
              <th key={c.label}>{c.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.month}>
              <td>{fullMonthLabel(row.month)}</td>
              {columns.map((c) => (
                <td key={c.label} className={c.cls?.(row)}>
                  {c.value(row)}
                </td>
              ))}
            </tr>
          ))}
          {totals && (
            <tr className={styles.totalRow}>
              <td>Total</td>
              {totals.map((cell, i) => (
                <td key={columns[i]?.label ?? i}>{cell}</td>
              ))}
            </tr>
          )}
        </tbody>
      </table>
    </div>
  )
}
