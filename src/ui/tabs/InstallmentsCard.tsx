import { useState } from 'react'
import type { InstallmentPlan } from '../../types'
import type { ExpenseActions, TransactionSeed } from '../actions'
import type { ExpenseModel } from '../useExpenseData'
import {
  finalBudgetMonth,
  isDueSoon,
  nextInstallmentSuggestion,
  type InstallmentSuggestion,
} from '../../engine'
import { formatCents } from '../../engine/money'
import { fullMonthLabel } from '../../engine/dates'
import { Card, SectionTitle } from '../components/primitives'
import { CategoryIcon } from '../components/CategoryIcon'
import { InstallmentPlansModal } from '../definitions/InstallmentPlansModal'
import { todayLocalIso } from '../dates'
import styles from './UpcomingCard.module.css'

interface Props {
  model: ExpenseModel
  actions: ExpenseActions
  month: string
}

function toSeed(s: InstallmentSuggestion): TransactionSeed {
  return {
    description: s.description,
    type: s.type,
    accountId: s.accountId,
    categoryId: s.categoryId,
    amountCents: s.amountCents,
    date: s.predictedDate,
    budgetMonth: s.budgetMonth,
    planId: s.planId,
    installmentIndex: s.installmentIndex,
  }
}

type DueEntry = { plan: InstallmentPlan; suggestion: InstallmentSuggestion }

export function InstallmentsCard({ model, actions, month }: Props) {
  const [managing, setManaging] = useState(false)
  const plans = model.dataset.installmentPlans
  if (plans.length === 0) return null

  const today = todayLocalIso()
  const due = plans
    .map((plan) => ({
      plan,
      suggestion: nextInstallmentSuggestion(plan, model.dataset.transactions, month),
    }))
    .filter((entry): entry is DueEntry => entry.suggestion !== null)
    .filter(
      ({ suggestion }) => !suggestion.dueDateKnown || isDueSoon(suggestion.predictedDate, today),
    )

  if (due.length === 0) return null

  return (
    <>
      <SectionTitle>Installments</SectionTitle>
      <Card>
        <p className={styles.meta}>Scheduled plan payments due now, not predictions.</p>
        {due.map(({ plan, suggestion }) => {
          const cat = model.lookup.category(suggestion.categoryId)
          return (
            <div key={suggestion.planId} className={styles.row}>
              <div className={styles.info}>
                <span className={styles.desc}>
                  <CategoryIcon icon={cat?.icon} name={cat?.name ?? suggestion.description} />{' '}
                  {suggestion.description}
                </span>
                <span className={styles.meta}>
                  Payment {suggestion.installmentIndex}/{suggestion.totalCount} ·{' '}
                  {formatCents(suggestion.amountCents)} · Final{' '}
                  {fullMonthLabel(finalBudgetMonth(plan))}
                </span>
              </div>
              <div className={styles.actions}>
                <button
                  type="button"
                  className={styles.addBtn}
                  onClick={() => actions.onAdd(toSeed(suggestion))}
                  aria-label="Log installment payment"
                >
                  +
                </button>
              </div>
            </div>
          )
        })}
        <button type="button" className={styles.manageBtn} onClick={() => setManaging(true)}>
          Manage plans
        </button>
      </Card>
      {managing ? (
        <InstallmentPlansModal
          model={model}
          actions={actions}
          onClose={() => setManaging(false)}
        />
      ) : null}
    </>
  )
}
