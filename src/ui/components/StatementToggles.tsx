import { useMemo, useState } from 'react'
import { isStatementPaid } from '../../engine/status'
import { todayLocalIso } from '../dates'
import { EXIT_MS } from '../hooks/motion'
import type { ExpenseModel } from '../useExpenseData'
import type { Account } from '../../types'
import { AccountStatements } from './AccountStatements'
import { findPaidOn } from './statementPaidOn'
import { useStatementCharges } from './useStatementCharges'
import { PresenceValue } from './Presence'
import { StatementPaymentSheet } from './StatementPaymentSheet'
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

async function saveStatement(
  onToggle: Props['onToggle'],
  setPending: (key: string | null) => void,
  accountId: number,
  yearMonth: string,
  paid: boolean,
  paidOn: string | undefined,
) {
  const key = `${accountId}:${yearMonth}`
  setPending(key)
  try {
    await onToggle(accountId, yearMonth, paid, paid ? (paidOn ?? todayLocalIso()) : undefined)
  } finally {
    setPending(null)
  }
}

export function StatementToggles({ model, onToggle }: Props) {
  const [pending, setPending] = useState<string | null>(null)
  const [editing, setEditing] = useState<EditingKey | null>(null)
  const { deferred, months, reconciliation, chargeCents } = useStatementCharges(model)

  const save = (
    accountId: number,
    yearMonth: string,
    paid: boolean,
    paidOn?: string,
  ) => saveStatement(onToggle, setPending, accountId, yearMonth, paid, paidOn)

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
        <AccountStatements
          key={account.id}
          account={account}
          months={months}
          model={model}
          pending={pending}
          chargeCents={chargeCents}
          onOpen={(accountId, yearMonth) => setEditing({ accountId, yearMonth })}
        />
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
