import { useState } from 'react'
import type { ExpenseActions } from '../actions'
import type { ExpenseModel } from '../useExpenseData'
import { nextInstallmentSuggestion, paidInstallmentInMonth } from '../../engine'
import { Card, SectionTitle } from '../components/primitives'
import { Presence } from '../components/Presence'
import { InstallmentPlansModal } from '../definitions/InstallmentPlansModal'
import { EXIT_MS } from '../hooks/motion'
import { InstallmentRow, type CardRow } from './InstallmentRow'
import styles from './InstallmentsCard.module.css'

interface Props {
  model: ExpenseModel
  actions: ExpenseActions
  month: string
}

export function InstallmentsCard({ model, actions, month }: Props) {
  const [managing, setManaging] = useState(false)
  const plans = model.dataset.installmentPlans
  if (plans.length === 0) return null

  const rows: CardRow[] = plans.flatMap((plan): CardRow[] => {
    const logged = paidInstallmentInMonth(plan, model.dataset.transactions, month)
    if (logged) return [{ kind: 'logged', plan, ...logged }]
    const suggestion = nextInstallmentSuggestion(plan, model.dataset.transactions, month)
    return suggestion ? [{ kind: 'due', plan, suggestion }] : []
  })

  return (
    <>
      <SectionTitle>Installments</SectionTitle>
      <Card className={styles.card}>
        <p className={styles.meta}>
          {rows.length > 0
            ? 'Scheduled plan payments for this month, not predictions.'
            : 'Nothing scheduled this month.'}
        </p>
        {rows.length > 0 ? (
          <div className={styles.columns} aria-hidden="true">
            <span className={styles.colPlan}>Plan</span>
            <span className={styles.colAccount}>Account</span>
            <span className={styles.colLast}>Last payment</span>
            <span className={styles.colAmount}>Amount</span>
            <span className={styles.colStatus}>Status</span>
          </div>
        ) : null}
        {rows.map((row) => (
          <InstallmentRow key={row.plan.id} row={row} model={model} actions={actions} />
        ))}
        <button type="button" className={styles.manageBtn} onClick={() => setManaging(true)}>
          Manage plans
        </button>
      </Card>
      <Presence show={managing} exitMs={EXIT_MS.sheet}>
        <InstallmentPlansModal model={model} actions={actions} onClose={() => setManaging(false)} />
      </Presence>
    </>
  )
}
