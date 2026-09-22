import { useMemo, useState } from 'react'
import { computeCashReconciliation, fullMonthLabel } from '../../engine'
import { isStatementPaid } from '../../engine/status'
import { todayLocalIso } from '../dates'
import { EXIT_MS } from '../hooks/motion'
import type { ExpenseModel } from '../useExpenseData'
import type { Account } from '../../types'
import { PresenceValue } from './Presence'
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

interface EditingSheet {
  key: EditingKey
  account: Account
  amountCents: number
  paid: boolean
  paidOn: string | undefined
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
  const deferred = useMemo(
    () => model.dataset.accounts.filter((a) => a.settlement === 'deferred' && a.active),
    [model.dataset],
  )
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

  // The whole displayed record, not just the key — otherwise a live change to `model`
  // during the sheet's exit would reword the closing sheet's amount or paid state, and a
  // fresh object every render would make PresenceValue think the value had changed on
  // every unrelated re-render while the sheet is open, forcing an extra render pass.
  const sheet = useMemo<EditingSheet | null>(() => {
    if (!editing) return null
    const account = deferred.find((a) => a.id === editing.accountId)
    if (!account) return null
    return {
      key: editing,
      account,
      amountCents: chargeCents(editing.accountId, editing.yearMonth),
      paid: isStatementPaid(model.dataset.accountStatements, editing.accountId, editing.yearMonth),
      paidOn: findPaidOn(model, editing.accountId, editing.yearMonth),
    }
    // chargeCents closes over reconciliation, already listed below; it needs no entry of its own.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing, deferred, model, reconciliation])

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

      <PresenceValue value={sheet} exitMs={EXIT_MS.sheet}>
        {({ key, account, amountCents, paid, paidOn }) => (
          <StatementPaymentSheet
            cardName={account.name}
            yearMonth={key.yearMonth}
            amountCents={amountCents}
            paid={paid}
            paidOn={paidOn}
            disabled={pending === `${key.accountId}:${key.yearMonth}`}
            onClose={() => setEditing(null)}
            onSave={(nextPaid, nextPaidOn) => save(key.accountId, key.yearMonth, nextPaid, nextPaidOn)}
          />
        )}
      </PresenceValue>
    </div>
  )
}
