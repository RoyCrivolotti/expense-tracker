import { useMemo, useState } from 'react'
import type { ExpenseModel } from '../../useExpenseData'
import type { CashRow, MoneyFormat } from '../../../engine'
import { computeCashReconciliation, formatCents, fullMonthLabel } from '../../../engine'
import { useMoneyFormat } from '../../hooks/moneyFormatContext'
import { ActualCashCell } from '../ActualCashCell'
import styles from './mobile.module.css'

interface Props {
  model: ExpenseModel
  onSetCashActual?: (yearMonth: string, actualCashCents: number | null) => Promise<void>
}

function gapBadge(gap: number | null, format: MoneyFormat) {
  if (gap === null) return <span className={`${styles.badge} ${styles.badgeMuted}`}>—</span>
  const cls = gap === 0 ? styles.badgeMuted : gap > 0 ? styles.badgeSuccess : styles.badgeDanger
  return <span className={`${styles.badge} ${cls}`}>{formatCents(gap, format, false)}</span>
}

function CashCard({
  row,
  cards,
  expanded,
  onToggle,
  onSetCashActual,
}: {
  row: CashRow
  cards: { id: number; name: string }[]
  expanded: boolean
  onToggle: () => void
  onSetCashActual: Props['onSetCashActual']
}) {
  const format = useMoneyFormat()
  return (
    <div className={styles.accordion}>
      <button type="button" className={styles.accordionHeader} onClick={onToggle}>
        <span>
          {fullMonthLabel(row.month)}
          {row.reconciled ? (
            <span
              title="Reconciled: all card statements paid and cash entered"
              style={{ marginLeft: '0.35rem', color: 'var(--exp-income)', fontWeight: 700 }}
            >
              ✓
            </span>
          ) : null}
        </span>
        {gapBadge(row.gapCents, format)}
      </button>
      {expanded && (
        <div className={styles.accordionBody}>
          <Row label="Income" cents={row.incomeCents} color="var(--exp-income)" />
          <Row label="Debit spend" cents={row.debitExpenseCents} />
          {cards.map((c) => {
            const charge = row.cardCharges.get(c.id)
            return (
              <Row
                key={c.id}
                label={c.name}
                cents={charge?.chargeCents ?? 0}
                muted={!charge?.paid}
              />
            )
          })}
          <Row label="Invested" cents={row.investmentsCents} />
          <Row label="Cash Δ" cents={row.cashMovementCents} signed />
          <Row label="Expected" cents={row.expectedCashCents} alwaysShow />
          <div className={styles.row}>
            <span className={styles.rowLabel}>Actual</span>
            <ActualCashCell
              month={row.month}
              valueCents={row.actualCashCents}
              onSave={onSetCashActual}
            />
          </div>
          <Row label="Unpaid liability" cents={row.unpaidLiabilityCents} muted />
          <GapRow label="Carryover" cents={row.carryoverGapCents} />
          <GapRow label="This month" cents={row.monthGapCents} />
          <GapRow label="Total gap" cents={row.gapCents} />
        </div>
      )}
    </div>
  )
}

function GapRow({ label, cents }: { label: string; cents: number | null }) {
  const format = useMoneyFormat()
  if (cents === null) {
    return (
      <div className={styles.row}>
        <span className={styles.rowLabel}>{label}</span>
        <span className={`${styles.badge} ${styles.badgeMuted}`}>—</span>
      </div>
    )
  }
  const cls = cents === 0 ? styles.badgeMuted : cents > 0 ? styles.badgeSuccess : styles.badgeDanger
  return (
    <div className={styles.row}>
      <span className={styles.rowLabel}>{label}</span>
      <span className={`${styles.badge} ${cls}`}>{formatCents(cents, format, false)}</span>
    </div>
  )
}

function Row({
  label,
  cents,
  color,
  signed,
  muted,
  alwaysShow,
}: {
  label: string
  cents: number
  color?: string
  signed?: boolean
  muted?: boolean
  alwaysShow?: boolean
}) {
  const format = useMoneyFormat()
  if (cents === 0 && !alwaysShow) {
    return (
      <div className={styles.row}>
        <span className={styles.rowLabel}>{label}</span>
        <span
          className={styles.rowValue}
          style={{ color: 'var(--color-text-muted)', opacity: 0.55 }}
        >
          —
        </span>
      </div>
    )
  }
  let c = color
  if (!c && signed) c = cents > 0 ? 'var(--exp-income)' : cents < 0 ? 'var(--exp-expense)' : ''
  if (muted) c = 'var(--exp-warning)'
  return (
    <div className={styles.row}>
      <span className={styles.rowLabel}>{label}</span>
      <span className={styles.rowValue} style={c ? { color: c } : undefined}>
        {formatCents(cents, format, false)}
      </span>
    </div>
  )
}

export function CashReconMobile({ model, onSetCashActual }: Props) {
  const { dataset } = model
  const cards = useMemo(
    () => dataset.accounts.filter((a) => a.settlement === 'deferred'),
    [dataset],
  )
  const rows = useMemo(
    () =>
      computeCashReconciliation(
        dataset.transactions,
        dataset.accounts,
        dataset.settings,
        dataset.cashActuals,
      )
        .slice()
        .reverse(),
    [dataset],
  )

  const [expanded, setExpanded] = useState<string>(rows[0]?.month ?? '')

  if (rows.length === 0) return null

  return (
    <div className={styles.section}>
      <p className={styles.hint}>
        Expected cash from opening balance; enter your actual after paying cards.
      </p>
      {rows.map((r) => (
        <CashCard
          key={r.month}
          row={r}
          cards={cards}
          expanded={expanded === r.month}
          onToggle={() => setExpanded(expanded === r.month ? '' : r.month)}
          onSetCashActual={onSetCashActual}
        />
      ))}
    </div>
  )
}
