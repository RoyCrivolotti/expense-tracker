import { useState } from 'react'
import type { WealthAccount, WealthAccountKind, WealthCheckin } from '../../../types'
import type { ExpenseActions } from '../../actions'
import { Card } from '../../components/primitives'
import { ConfirmSheet } from '../../components/ConfirmSheet'
import { Presence } from '../../components/Presence'
import { EXIT_MS } from '../../hooks/motion'
import styles from './progress.module.css'
import goalStyles from './goals.module.css'

// The server keeps an account that check-ins refer to, marking it archived instead, so the
// question has to say which of the two is about to happen.
function deleteMessage(account: WealthAccount, checkins: WealthCheckin[]): string {
  const inHistory = checkins.some((c) => c.entries.some((e) => e.accountId === account.id))
  return inHistory
    ? 'It appears in past check-ins, so it is archived rather than deleted: those balances stay and it leaves this list.'
    : 'No check-in mentions it yet, so it is removed outright.'
}

const KIND_LABELS: Record<WealthAccountKind, string> = {
  investment: 'Investment',
  cash: 'Cash',
  other_asset: 'Other asset',
  debt: 'Debt',
}

interface Props {
  accounts: WealthAccount[]
  checkins?: WealthCheckin[]
  actions: ExpenseActions
}

export function WealthAccountsManager({ accounts, checkins = [], actions }: Props) {
  const [showForm, setShowForm] = useState(false)
  const [name, setName] = useState('')
  const [kind, setKind] = useState<WealthAccountKind>('investment')
  const [submitting, setSubmitting] = useState(false)
  const [pendingDelete, setPendingDelete] = useState<WealthAccount | null>(null)
  const [confirmOpen, setConfirmOpen] = useState(false)

  const handleAdd = async () => {
    if (!name.trim()) return
    setSubmitting(true)
    try {
      await actions.createWealthAccount({ name: name.trim(), kind, sortOrder: accounts.length, archived: false })
      setName('')
      setKind('investment')
      setShowForm(false)
    } finally {
      setSubmitting(false)
    }
  }

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
            <li key={acc.id} className={styles.accountRow}>
              <span
                className={[
                  styles.accountKindBadge,
                  acc.kind === 'investment' ? styles.accountKindInvestment
                    : acc.kind === 'cash' ? styles.accountKindCash
                    : acc.kind === 'debt' ? styles.accountKindDebt
                    : '',
                ].join(' ')}
              >
                {KIND_LABELS[acc.kind]}
              </span>
              <span className={styles.accountName}>{acc.name}</span>
              <button
                className={goalStyles.iconBtn}
                aria-label={`Delete ${acc.name}`}
                onClick={() => {
                  setPendingDelete(acc)
                  setConfirmOpen(true)
                }}
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
      )}

      {showForm ? (
        <div className={styles.addAccountForm}>
          <div className={styles.addAccountFields}>
            <input
              className={styles.textInput}
              type="text"
              placeholder="Account name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { void handleAdd() } }}
              autoFocus
            />
            <select
              className={styles.selectInput}
              value={kind}
              onChange={(e) => setKind(e.target.value as WealthAccountKind)}
            >
              {(Object.keys(KIND_LABELS) as WealthAccountKind[]).map((k) => (
                <option key={k} value={k}>{KIND_LABELS[k]}</option>
              ))}
            </select>
          </div>
          <div className={styles.formActions}>
            <button className={goalStyles.btn} onClick={() => { void handleAdd() }} disabled={submitting || !name.trim()}>
              Add
            </button>
            <button
              className={goalStyles.btn}
              style={{ background: 'none', color: 'var(--color-text-muted)' }}
              onClick={() => { setShowForm(false); setName(''); setKind('investment') }}
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button
          className={goalStyles.btn}
          style={{ alignSelf: 'flex-start' }}
          onClick={() => setShowForm(true)}
        >
          + Add account
        </button>
      )}

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
