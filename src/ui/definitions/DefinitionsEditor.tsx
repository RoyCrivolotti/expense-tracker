import { useState, type ReactNode } from 'react'
import { formatCents } from '../../engine'
import { useMoneyFormat } from '../hooks/moneyFormatContext'
import type { ExpenseSettings } from '../../types'
import type { ExpenseModel } from '../useExpenseData'
import type { ExpenseActions } from '../actions'
import { Card, SectionTitle } from '../components/primitives'
import { Money } from '../components/Money'
import { PresenceValue } from '../components/Presence'
import { EXIT_MS } from '../hooks/motion'
import { ConfigModal, type EditTarget } from './ConfigModal'
import { FlagList } from './FlagList'
import { CategoryIcon } from '../components/CategoryIcon'
import styles from './definitions.module.css'
import tabStyles from '../tabs/tabs.module.css'

type OnEdit = (target: EditTarget) => void

function DefRow({
  name,
  icon,
  meta,
  active,
  onEdit,
}: {
  name: string
  icon?: string | undefined
  meta: string
  active?: boolean
  onEdit: () => void
}) {
  return (
    <div className={active === false ? `${styles.row} ${styles.inactive}` : styles.row}>
      <div className={styles.rowMain}>
        <span className={styles.rowName}>
          <CategoryIcon icon={icon} name={name} /> {name}
        </span>
        <span className={styles.rowMeta}>{meta}</span>
      </div>
      <button type="button" className={styles.editBtn} onClick={onEdit}>
        Edit
      </button>
    </div>
  )
}

function ScalarCard({
  rows,
  onEdit,
  label,
}: {
  rows: ReactNode
  onEdit: () => void
  label: string
}) {
  return (
    <Card>
      {rows}
      <button type="button" className={styles.addBtn} onClick={onEdit}>
        {label}
      </button>
    </Card>
  )
}

function CategoryList({ model, onEdit }: { model: ExpenseModel; onEdit: OnEdit }) {
  const format = useMoneyFormat()
  const cats = model.dataset.categories
  const total = cats.reduce((s, c) => s + c.monthlyBudgetCents, 0)
  return (
    <Card>
      {cats.map((c) => (
        <DefRow
          key={c.id}
          name={c.name}
          icon={c.icon}
          active={c.active}
          meta={`${formatCents(c.monthlyBudgetCents, format)} · order ${c.sortOrder}`}
          onEdit={() => onEdit({ kind: 'category', record: c })}
        />
      ))}
      <div className={`${tabStyles.defRow} ${tabStyles.defTotal}`}>
        <span>Total monthly budget</span>
        <Money cents={total} />
      </div>
      <button
        type="button"
        className={styles.addBtn}
        onClick={() => onEdit({ kind: 'category', record: null })}
      >
        + Add category
      </button>
    </Card>
  )
}

function AccountList({ model, onEdit }: { model: ExpenseModel; onEdit: OnEdit }) {
  return (
    <Card>
      {model.dataset.accounts.map((a) => (
        <DefRow
          key={a.id}
          name={a.name}
          active={a.active}
          meta={a.settlement === 'immediate' ? 'Debit · posts instantly' : 'Card · posts when paid'}
          onEdit={() => onEdit({ kind: 'account', record: a })}
        />
      ))}
      <button
        type="button"
        className={styles.addBtn}
        onClick={() => onEdit({ kind: 'account', record: null })}
      >
        + Add account
      </button>
    </Card>
  )
}

function BalanceRows({ s }: { s: ExpenseSettings }) {
  return (
    <>
      <div className={tabStyles.defRow}>
        <span>Cash (1 Jan)</span>
        <Money cents={s.openingCashCents} />
      </div>
      <div className={tabStyles.defRow}>
        <span>Investments (1 Jan)</span>
        <Money cents={s.openingInvestmentCents} />
      </div>
    </>
  )
}

export function DefinitionsEditor({
  model,
  actions,
}: {
  model: ExpenseModel
  actions: ExpenseActions
}) {
  const [target, setTarget] = useState<EditTarget | null>(null)

  return (
    <>
      <SectionTitle>Categories</SectionTitle>
      <CategoryList model={model} onEdit={setTarget} />
      <SectionTitle>Accounts</SectionTitle>
      <AccountList model={model} onEdit={setTarget} />
      <FlagList model={model} actions={actions} />
      <SectionTitle>Opening balances</SectionTitle>
      <ScalarCard
        rows={<BalanceRows s={model.dataset.settings} />}
        label="Edit balances"
        onEdit={() => setTarget({ kind: 'settings' })}
      />
      <PresenceValue value={target} exitMs={EXIT_MS.sheet}>
        {(shown) => (
          <ConfigModal
            target={shown}
            model={model}
            actions={actions}
            onClose={() => setTarget(null)}
          />
        )}
      </PresenceValue>
    </>
  )
}
