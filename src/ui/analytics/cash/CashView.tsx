import { useMemo, useState } from 'react'
import type { ExpenseActions } from '../../actions'
import type { ExpenseModel } from '../../useExpenseData'
import type { BalancesAtCost, CashRow, MonthCloseStatus } from '../../../engine'
import {
  balancesAtCost,
  computeCashReconciliation,
  firstCountedMonth,
  formatCentsCompact,
  fullMonthLabel,
  monthCloseStatus,
  readyToCountMonth,
} from '../../../engine'
import { useMoneyFormat } from '../../hooks/moneyFormatContext'
import { Card, EmptyState } from '../../components/primitives'
import { ActualCashCell } from '../ActualCashCell'
import { CashReconciliationTable } from '../CashReconciliationTable'
import { MonthCloseDots } from './MonthCloseDots'
import { CashBridge } from './CashBridge'
import { DriftBars } from './DriftBars'
import styles from './cash.module.css'

const STATUS_NOTE = {
  counted: 'Counted — this month is square.',
  drift: 'Counted, with drift beyond the band: a transaction is missing or mistyped.',
  ready: 'Statements are paid. Count the cash you hold and enter it below.',
  waiting: 'A card statement is unpaid, so the cash cannot be counted yet.',
  open: 'This month has not ended yet. Count the cash once it does.',
  untracked: 'From before you started counting, so there is nothing to reconcile here.',
} as const

const BASELINE_NOTE =
  'Starting point: this count sets the baseline, and drift is measured from here on.'

function CloseCard({
  row,
  status,
  baseline,
  actions,
}: {
  row: CashRow
  status: MonthCloseStatus
  /** The first month ever counted: its gap holds every month before it. */
  baseline: boolean
  actions?: ExpenseActions | undefined
}) {
  const format = useMoneyFormat()
  return (
    <Card>
      <h3 className={styles.cardTitle}>{fullMonthLabel(row.month)}</h3>
      <p className={styles.cardSub}>{baseline ? BASELINE_NOTE : STATUS_NOTE[status]}</p>
      <CashBridge row={row} />
      <div className={styles.countRow}>
        <span className={styles.countLabel}>Counted cash</span>
        <ActualCashCell month={row.month} valueCents={row.actualCashCents} onSave={actions?.setCashActual} />
      </div>
      {row.gapCents !== null && (
        <p className={styles.gapNote}>
          Total gap {formatCentsCompact(row.gapCents, format)}
          {!baseline &&
            row.monthGapCents !== null &&
            ` — of it new this month: ${formatCentsCompact(row.monthGapCents, format)}`}
          .
        </p>
      )}
    </Card>
  )
}

function DriftCard({
  rows,
  status,
  balances,
}: {
  rows: CashRow[]
  status: MonthCloseStatus
  balances: BalancesAtCost | null
}) {
  const format = useMoneyFormat()
  const counted = status === 'counted' || status === 'drift'
  return (
    <Card>
      <h3 className={styles.cardTitle}>Drift</h3>
      <DriftBars rows={rows} />
      {balances && (
        <div className={styles.balances}>
          <div className={styles.balanceRow}>
            <span>Cash, {counted ? 'counted' : 'expected'}</span>
            <b>{formatCentsCompact(balances.cashCents, format)}</b>
          </div>
          <div className={styles.balanceRow}>
            <span>Invested, at cost</span>
            <b>{formatCentsCompact(balances.investedAtCostCents, format)}</b>
          </div>
          <p className={styles.balanceNote}>
            Cost, not market value — Goals tracks the market value from your check-ins.
          </p>
        </div>
      )}
    </Card>
  )
}

/** Do my numbers match reality? Month close, the bridge, drift, balances at cost. */
export function CashView({
  model,
  month,
  openMonth,
  actions,
}: {
  model: ExpenseModel
  month: string
  /** The budget month under way (rollover-aware); months past it are never "ready". */
  openMonth: string
  actions?: ExpenseActions | undefined
}) {
  const rows = useMemo(
    () =>
      computeCashReconciliation(
        model.dataset.transactions,
        model.dataset.accounts,
        model.dataset.settings,
        model.dataset.cashActuals,
      ),
    [model.dataset],
  )
  const [picked, setPicked] = useState<string | null>(null)
  // The header month picker outranks a dot tapped earlier: changing it means
  // "show me that month", so the local pick resets (render-phase, pre-paint).
  const [pickedFor, setPickedFor] = useState(month)
  if (pickedFor !== month) {
    setPickedFor(month)
    setPicked(null)
  }
  const readyMonth = readyToCountMonth(rows, openMonth)
  const pickedRow = picked !== null && rows.some((r) => r.month === picked) ? picked : null
  const selectedMonth =
    pickedRow ?? (rows.some((r) => r.month === month) ? month : rows[rows.length - 1]?.month)
  const selected = rows.find((r) => r.month === selectedMonth)
  const balances = useMemo(
    () =>
      selected
        ? balancesAtCost(rows, model.dataset.settings, model.dataset.transactions, selected.month)
        : null,
    [rows, model.dataset, selected],
  )

  if (rows.length === 0 || !selected) {
    return <EmptyState>No months to reconcile yet.</EmptyState>
  }
  const countingStart = firstCountedMonth(rows)
  const status = monthCloseStatus(selected, undefined, openMonth, countingStart)

  return (
    <div className={styles.stack}>
      {readyMonth !== null && readyMonth !== selected.month && (
        <button type="button" className={styles.banner} onClick={() => setPicked(readyMonth)}>
          {fullMonthLabel(readyMonth)} is ready to count.
        </button>
      )}
      <Card>
        <h3 className={styles.cardTitle}>Month close</h3>
        <MonthCloseDots
          rows={rows}
          selected={selected.month}
          openMonth={openMonth}
          onSelect={setPicked}
        />
      </Card>
      <div className={styles.grid2}>
        <CloseCard
          row={selected}
          status={status}
          baseline={selected.month === countingStart}
          actions={actions}
        />
        <DriftCard rows={rows} status={status} balances={balances} />
      </div>
      <details className={styles.fold}>
        <summary className={styles.foldSummary}>Full reconciliation table</summary>
        <CashReconciliationTable
          model={model}
          {...(actions ? { onSetCashActual: actions.setCashActual } : {})}
        />
      </details>
    </div>
  )
}
