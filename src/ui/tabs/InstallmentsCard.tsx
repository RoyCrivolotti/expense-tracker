import { useState } from 'react'
import type { InstallmentPlan, Transaction } from '../../types'
import type { ExpenseActions, TransactionSeed } from '../actions'
import type { ExpenseModel } from '../useExpenseData'
import {
  finalBudgetMonth,
  nextInstallmentSuggestion,
  paidInstallmentInMonth,
  type InstallmentSuggestion,
} from '../../engine'
import { formatCents } from '../../engine/money'
import { fullMonthLabel } from '../../engine/dates'
import { Card, SectionTitle } from '../components/primitives'
import { CategoryIcon } from '../components/CategoryIcon'
import { InstallmentPlansModal } from '../definitions/InstallmentPlansModal'
import { useMoneyFormat } from '../hooks/moneyFormatContext'
import { shortDayLabel } from '../format'
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

type CardRow =
  | { kind: 'paid'; plan: InstallmentPlan; transaction: Transaction; installmentIndex: number }
  | { kind: 'due'; plan: InstallmentPlan; suggestion: InstallmentSuggestion }

export function InstallmentsCard({ model, actions, month }: Props) {
  const format = useMoneyFormat()
  const [managing, setManaging] = useState(false)
  const plans = model.dataset.installmentPlans
  if (plans.length === 0) return null

  const rows: CardRow[] = plans.flatMap((plan): CardRow[] => {
    const paid = paidInstallmentInMonth(plan, model.dataset.transactions, month)
    if (paid) return [{ kind: 'paid', plan, ...paid }]
    const suggestion = nextInstallmentSuggestion(plan, model.dataset.transactions, month)
    return suggestion ? [{ kind: 'due', plan, suggestion }] : []
  })

  return (
    <>
      <SectionTitle>Installments</SectionTitle>
      <Card>
        <p className={styles.meta}>
          {rows.length > 0
            ? 'Scheduled plan payments for this month, not predictions.'
            : 'Nothing scheduled this month.'}
        </p>
        {rows.map((row) => {
          const cat = model.lookup.category(row.plan.categoryId)

          if (row.kind === 'paid') {
            const { plan, transaction, installmentIndex } = row
            return (
              <button
                key={plan.id}
                type="button"
                className={`${styles.row} ${styles.rowButton}`}
                onClick={() => actions.onEdit(transaction)}
              >
                <div className={styles.info}>
                  <span className={styles.desc}>
                    <CategoryIcon icon={cat?.icon} name={cat?.name ?? plan.description} />{' '}
                    {plan.description}
                  </span>
                  <span className={styles.meta}>
                    Payment {installmentIndex}/{plan.totalCount} ·{' '}
                    {formatCents(transaction.amountCents, format)} · Paid{' '}
                    {shortDayLabel(transaction.date)} · Final{' '}
                    {fullMonthLabel(finalBudgetMonth(plan))}
                  </span>
                </div>
              </button>
            )
          }

          const { plan, suggestion } = row
          return (
            <div key={plan.id} className={styles.row}>
              <div className={styles.info}>
                <span className={styles.desc}>
                  <CategoryIcon icon={cat?.icon} name={cat?.name ?? suggestion.description} />{' '}
                  {suggestion.description}
                </span>
                <span className={styles.meta}>
                  Payment {suggestion.installmentIndex}/{suggestion.totalCount} ·{' '}
                  {formatCents(suggestion.amountCents, format)} · Due{' '}
                  {suggestion.dueDateKnown ? shortDayLabel(suggestion.predictedDate) : 'this month'}{' '}
                  · Final {fullMonthLabel(finalBudgetMonth(plan))}
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
