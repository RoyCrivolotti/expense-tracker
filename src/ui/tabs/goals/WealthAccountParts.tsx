import { useState } from 'react'
import type { WealthAccount, WealthAccountKind } from '../../../types'
import type { ExpenseActions } from '../../actions'
import styles from './progress.module.css'
import goalStyles from './goals.module.css'

const KIND_LABELS: Record<WealthAccountKind, string> = {
  investment: 'Investment',
  cash: 'Cash',
  other_asset: 'Other asset',
  debt: 'Debt',
}

/** One account in the list: its kind, its name, and the button that asks before deleting it. */
export function AccountRow({ acc, onDelete }: { acc: WealthAccount; onDelete: () => void }) {
  return (
    <li className={styles.accountRow}>
      <span
        className={[
          styles.accountKindBadge,
          acc.kind === 'investment'
            ? styles.accountKindInvestment
            : acc.kind === 'cash'
              ? styles.accountKindCash
              : acc.kind === 'debt'
                ? styles.accountKindDebt
                : '',
        ].join(' ')}
      >
        {KIND_LABELS[acc.kind]}
      </span>
      <span className={styles.accountName}>{acc.name}</span>
      <button className={goalStyles.iconBtn} aria-label={`Delete ${acc.name}`} onClick={onDelete}>
        ✕
      </button>
    </li>
  )
}

/** The kind of a new account: what it is counted as in the net worth and the cash reserve. */
function KindSelect({ kind, setKind }: { kind: WealthAccountKind; setKind: (kind: WealthAccountKind) => void }) {
  return (
    <select className={styles.selectInput} value={kind} onChange={(e) => setKind(e.target.value as WealthAccountKind)}>
      {(Object.keys(KIND_LABELS) as WealthAccountKind[]).map((k) => (
        <option key={k} value={k}>
          {KIND_LABELS[k]}
        </option>
      ))}
    </select>
  )
}

/** The form for a new account: its name and kind, added with the button or Enter. */
function AddAccountForm({
  name,
  setName,
  kind,
  setKind,
  submitting,
  onAdd,
  onCancel,
}: {
  name: string
  setName: (name: string) => void
  kind: WealthAccountKind
  setKind: (kind: WealthAccountKind) => void
  submitting: boolean
  onAdd: () => Promise<void>
  onCancel: () => void
}) {
  return (
    <div className={styles.addAccountForm}>
      <div className={styles.addAccountFields}>
        <input
          className={styles.textInput}
          type="text"
          placeholder="Account name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              void onAdd()
            }
          }}
          autoFocus
        />
        <KindSelect kind={kind} setKind={setKind} />
      </div>
      <div className={styles.formActions}>
        <button
          className={goalStyles.btn}
          onClick={() => {
            void onAdd()
          }}
          disabled={submitting || !name.trim()}
        >
          Add
        </button>
        <button
          className={goalStyles.btn}
          style={{ background: 'none', color: 'var(--color-text-muted)' }}
          onClick={onCancel}
        >
          Cancel
        </button>
      </div>
    </div>
  )
}

/** Adding an account: the button, and the form it opens, which holds what is typed until it is added or cancelled. */
export function AddAccount({ count, actions }: { count: number; actions: ExpenseActions }) {
  const [showForm, setShowForm] = useState(false)
  const [name, setName] = useState('')
  const [kind, setKind] = useState<WealthAccountKind>('investment')
  const [submitting, setSubmitting] = useState(false)

  const handleAdd = async () => {
    if (!name.trim()) return
    setSubmitting(true)
    try {
      await actions.createWealthAccount({ name: name.trim(), kind, sortOrder: count, archived: false })
      setName('')
      setKind('investment')
      setShowForm(false)
    } finally {
      setSubmitting(false)
    }
  }

  return showForm ? (
    <AddAccountForm
      name={name}
      setName={setName}
      kind={kind}
      setKind={setKind}
      submitting={submitting}
      onAdd={handleAdd}
      onCancel={() => {
        setShowForm(false)
        setName('')
        setKind('investment')
      }}
    />
  ) : (
    <button className={goalStyles.btn} style={{ alignSelf: 'flex-start' }} onClick={() => setShowForm(true)}>
      + Add account
    </button>
  )
}
