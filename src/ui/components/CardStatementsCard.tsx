import { useMemo, useState } from 'react'
import type { ExpenseDataset } from '../../types'
import type { ExpenseActions } from '../actions'
import { computeCashReconciliation } from '../../engine'
import { isStatementPaid } from '../../engine/status'
import { todayLocalIso } from '../dates'
import { StatementPaymentSheet } from './StatementPaymentSheet'
import { StatementSummaryRow } from './StatementSummaryRow'
import { Card, SectionTitle } from './primitives'

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
  const [pending, setPending] = useState<number | null>(null)
  const [editingId, setEditingId] = useState<number | null>(null)

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

  const save = actions?.setStatementPaid
    ? async (accountId: number, paid: boolean, paidOn?: string) => {
        setPending(accountId)
        try {
          await actions.setStatementPaid(
            accountId,
            month,
            paid,
            paid ? (paidOn ?? todayLocalIso()) : undefined,
          )
        } finally {
          setPending(null)
        }
      }
    : undefined

  const editing = statements.find((s) => s.id === editingId) ?? null

  return (
    <>
      <SectionTitle>Card statements</SectionTitle>
      <Card>
        {statements.map((s) => (
          <StatementSummaryRow
            key={s.id}
            name={s.name}
            amountCents={s.chargeCents}
            paid={s.paid}
            paidOn={s.paidOn}
            disabled={pending === s.id}
            {...(save && s.chargeCents !== 0 ? { onPress: () => setEditingId(s.id) } : {})}
          />
        ))}
      </Card>
      {editing && save ? (
        <StatementPaymentSheet
          cardName={editing.name}
          yearMonth={month}
          amountCents={editing.chargeCents}
          paid={editing.paid}
          paidOn={editing.paidOn}
          disabled={pending === editing.id}
          onClose={() => setEditingId(null)}
          onSave={(paid, paidOn) => save(editing.id, paid, paidOn)}
        />
      ) : null}
    </>
  )
}
