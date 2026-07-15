import { useMemo, useState } from 'react'
import { computeCashReconciliation, fullMonthLabel } from '../../engine'
import { isStatementPaid } from '../../engine/status'
import { todayLocalIso } from '../dates'
import type { ExpenseModel } from '../useExpenseData'
import { StatementPaymentSheet } from './StatementPaymentSheet'
import { StatementSummaryRow } from './StatementSummaryRow'
import styles from './StatementToggles.module.css'

interface Props {
  model: ExpenseModel
  onToggle: (
    accountId: number,
    yearMonth: string,
    paid: boolean,
    paidOn?: string,
  ) => Promise<void>
}

interface EditingKey {
  accountId: number
  yearMonth: string
}

function findPaidOn(
  model: ExpenseModel,
  accountId: number,
  yearMonth: string,
): string | undefined {
  return model.dataset.accountStatements.find(
    (s) => s.accountId === accountId && s.yearMonth === yearMonth,
  )?.paidOn
}

export function StatementToggles({ model, onToggle }: Props) {
  const [pending, setPending] = useState<string | null>(null)
  const [editing, setEditing] = useState<EditingKey | null>(null)
  const deferred = model.dataset.accounts.filter((a) => a.settlement === 'deferred' && a.active)
  const months = [...model.months].reverse()

  const reconciliation = useMemo(
    () =>
      computeCashReconciliation(
        model.dataset.transactions,
        model.dataset.accounts,
        model.dataset.settings,
        model.dataset.cashActuals,
      ),
    [model.dataset],
  )

  const chargeCents = (accountId: number, yearMonth: string): number =>
    reconciliation.find((r) => r.month === yearMonth)?.cardCharges.get(accountId)?.chargeCents ?? 0

  const save = async (
    accountId: number,
    yearMonth: string,
    paid: boolean,
    paidOn?: string,
  ) => {
    const key = `${accountId}:${yearMonth}`
    setPending(key)
    try {
      await onToggle(accountId, yearMonth, paid, paid ? (paidOn ?? todayLocalIso()) : undefined)
    } finally {
      setPending(null)
    }
  }

  const editingAccount = editing
    ? deferred.find((a) => a.id === editing.accountId) ?? null
    : null

  return (
    <div className={styles.wrap}>
      {deferred.map((account) => (
        <div key={account.id} className={styles.account}>
          <div className={styles.accountName}>{account.name}</div>
          <div className={styles.months}>
            {months.map((m) => {
              const paid = isStatementPaid(model.dataset.accountStatements, account.id, m)
              const amountCents = chargeCents(account.id, m)
              const key = `${account.id}:${m}`
              return (
                <StatementSummaryRow
                  key={m}
                  name={fullMonthLabel(m)}
                  amountCents={amountCents}
                  paid={paid}
                  paidOn={findPaidOn(model, account.id, m)}
                  disabled={pending === key}
                  {...(amountCents !== 0
                    ? { onPress: () => setEditing({ accountId: account.id, yearMonth: m }) }
                    : {})}
                />
              )
            })}
          </div>
        </div>
      ))}

      {editing && editingAccount ? (
        <StatementPaymentSheet
          cardName={editingAccount.name}
          yearMonth={editing.yearMonth}
          amountCents={chargeCents(editing.accountId, editing.yearMonth)}
          paid={isStatementPaid(model.dataset.accountStatements, editing.accountId, editing.yearMonth)}
          paidOn={findPaidOn(model, editing.accountId, editing.yearMonth)}
          disabled={pending === `${editing.accountId}:${editing.yearMonth}`}
          onClose={() => setEditing(null)}
          onSave={(paid, paidOn) => save(editing.accountId, editing.yearMonth, paid, paidOn)}
        />
      ) : null}
    </div>
  )
}
