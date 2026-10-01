import { useMemo, useState } from 'react'
import type { ExpenseDataset } from '../../types'
import type { ExpenseActions } from '../actions'
import { computeCashReconciliation } from '../../engine'
import { isStatementPaid } from '../../engine/status'
import { todayLocalIso } from '../dates'
import { EXIT_MS } from '../hooks/motion'
import { failureMessage } from '../hooks/useFailureToast'
import { useToast } from '../hooks/useToast'
import { PresenceValue } from './Presence'
import { StatementPaymentSheet } from './StatementPaymentSheet'
import { StatementSummaryRow } from './StatementSummaryRow'
import { Card, SectionTitle } from './primitives'
import styles from './CardStatementsCard.module.css'

interface CardStatementsCardProps {
  dataset: ExpenseDataset
  month: string
  actions?: ExpenseActions | undefined
}

interface StatementRow {
  id: number
  name: string
  chargeCents: number
  paid: boolean
  paidOn?: string | undefined
}

function findPaidOn(
  statements: ExpenseDataset['accountStatements'],
  accountId: number,
  yearMonth: string,
): string | undefined {
  return statements.find((s) => s.accountId === accountId && s.yearMonth === yearMonth)?.paidOn
}

export function CardStatementsCard({ dataset, month, actions }: CardStatementsCardProps) {
  const [pending, setPending] = useState<ReadonlySet<number>>(() => new Set())
  const [editingId, setEditingId] = useState<number | null>(null)
  const { showToast } = useToast()

  const statements = useMemo<StatementRow[]>(() => {
    const deferred = dataset.accounts.filter((a) => a.settlement === 'deferred' && a.active)
    if (deferred.length === 0) return []

    const rows = computeCashReconciliation(
      dataset.transactions,
      dataset.accounts,
      dataset.settings,
      dataset.cashActuals,
    )
    const row = rows.find((r) => r.month === month)

    return deferred.map((account) => ({
      id: account.id,
      name: account.name,
      chargeCents: row?.cardCharges.get(account.id)?.chargeCents ?? 0,
      paid: isStatementPaid(dataset.accountStatements, account.id, month),
      paidOn: findPaidOn(dataset.accountStatements, account.id, month),
    }))
  }, [dataset, month])

  if (statements.length === 0) return null

  // A save is tracked per card: one card's save finishing must not unlock another's.
  const track = (accountId: number, saving: boolean) =>
    setPending((prev) => {
      const next = new Set(prev)
      if (saving) next.add(accountId)
      else next.delete(accountId)
      return next
    })

  const save = actions?.setStatementPaid
    ? async (accountId: number, paid: boolean, paidOn?: string) => {
        track(accountId, true)
        try {
          await actions.setStatementPaid(
            accountId,
            month,
            paid,
            paid ? (paidOn ?? todayLocalIso()) : undefined,
          )
        } finally {
          track(accountId, false)
        }
      }
    : undefined

  // One tap, dated today. Another day is picked in the sheet the row opens.
  const markPaidToday = save
    ? async (row: StatementRow) => {
        try {
          await save(row.id, true)
          showToast(`${row.name} marked paid today`, 'success')
        } catch (e) {
          showToast(failureMessage(e), 'error')
        }
      }
    : undefined

  const editing = statements.find((s) => s.id === editingId) ?? null

  return (
    <>
      <SectionTitle>Card statements</SectionTitle>
      <Card>
        <div className={styles.list}>
          {statements.map((s) => {
            const actionable = save !== undefined && s.chargeCents !== 0
            return (
              <StatementSummaryRow
                key={s.id}
                name={s.name}
                amountCents={s.chargeCents}
                paid={s.paid}
                paidOn={s.paidOn}
                disabled={pending.has(s.id)}
                {...(actionable ? { onPress: () => setEditingId(s.id) } : {})}
                {...(actionable && !s.paid && markPaidToday
                  ? { onMarkPaidToday: () => void markPaidToday(s) }
                  : {})}
              />
            )
          })}
        </div>
      </Card>
      <PresenceValue value={save ? editing : null} exitMs={EXIT_MS.sheet}>
        {(statement) =>
          save && (
            <StatementPaymentSheet
              cardName={statement.name}
              yearMonth={month}
              amountCents={statement.chargeCents}
              paid={statement.paid}
              paidOn={statement.paidOn}
              disabled={pending.has(statement.id)}
              onClose={() => setEditingId(null)}
              onSave={(paid, paidOn) => save(statement.id, paid, paidOn)}
            />
          )
        }
      </PresenceValue>
    </>
  )
}
