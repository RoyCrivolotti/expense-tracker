import { useState } from 'react'
import type { WealthAccount, WealthCheckin } from '../../../types'
import type { ExpenseActions } from '../../actions'
import { Card } from '../../components/primitives'
import { ConfirmSheet } from '../../components/ConfirmSheet'
import { Presence } from '../../components/Presence'
import { EXIT_MS } from '../../hooks/motion'
import { AccountRow, AddAccount } from './WealthAccountParts'
import styles from './progress.module.css'
import goalStyles from './goals.module.css'

// The server keeps an account that check-ins refer to, marking it archived instead, so the
// question has to say which of the two is about to happen.
function deleteMessage(
  account: WealthAccount,
  checkins: WealthCheckin[],
): string {
  const inHistory = checkins.some((c) => c.entries.some((e) => e.accountId === account.id))
  return inHistory
    ? 'It appears in past check-ins, so it is archived rather than deleted: those balances stay and it leaves this list.'
    : 'No check-in mentions it yet, so it is removed outright.'
}

interface Props {
  accounts: WealthAccount[]
  checkins?: WealthCheckin[]
  actions: ExpenseActions
}

export function WealthAccountsManager({ accounts, checkins = [], actions }: Props) {
  const [pendingDelete, setPendingDelete] = useState<WealthAccount | null>(null)
  const [confirmOpen, setConfirmOpen] = useState(false)

  const active = accounts.filter((a) => !a.archived)

  return (
    <Card>
      <h3 className={goalStyles.sectionTitle}>Wealth accounts</h3>
      <p className={styles.emptyHint} style={{ marginBottom: '0.75rem' }}>
        Name the accounts you track — broker, savings, pension, etc.
      </p>

      {active.length > 0 && (
        <ul className={styles.accountsList} role="list">
          {active.map((acc) => (
            <AccountRow
              key={acc.id}
              acc={acc}
              onDelete={() => {
                setPendingDelete(acc)
                setConfirmOpen(true)
              }}
            />
          ))}
        </ul>
      )}

      <AddAccount count={accounts.length} actions={actions} />

      <Presence show={confirmOpen} exitMs={EXIT_MS.sheet}>
        {pendingDelete ? (
          <ConfirmSheet
            title={`Delete ${pendingDelete.name}?`}
            message={deleteMessage(pendingDelete, checkins)}
            confirmLabel="Delete"
            destructive
            onConfirm={() => {
              setConfirmOpen(false)
              void actions.deleteWealthAccount(pendingDelete.id)
            }}
            onCancel={() => setConfirmOpen(false)}
          />
        ) : null}
      </Presence>
    </Card>
  )
}
