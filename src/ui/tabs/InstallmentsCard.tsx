import type { InstallmentPlan, Transaction } from '../../types'
import type { TransactionSeed } from '../actions'
import type { Lookup } from '../format'
import {
  finalBudgetMonth,
  nextInstallmentSuggestion,
  type InstallmentSuggestion,
} from '../../engine'
import { formatCents } from '../../engine/money'
import { fullMonthLabel } from '../../engine/dates'
import { Card, SectionTitle } from '../components/primitives'
import { CategoryIcon } from '../components/CategoryIcon'
import styles from './UpcomingCard.module.css'

interface Props {
  plans: InstallmentPlan[]
  transactions: Transaction[]
  lookup: Lookup
  month: string
  onAdd: (seed: TransactionSeed) => void
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

export function InstallmentsCard({ plans, transactions, lookup, month, onAdd }: Props) {
  const due = plans
    .map((plan) => ({ plan, suggestion: nextInstallmentSuggestion(plan, transactions, month) }))
    .filter((entry): entry is { plan: InstallmentPlan; suggestion: InstallmentSuggestion } =>
      entry.suggestion !== null,
    )

  if (due.length === 0) return null

  return (
    <>
      <SectionTitle>Installments</SectionTitle>
      <Card>
        <p className={styles.meta}>Scheduled plan payments due this month, not predictions.</p>
        {due.map(({ plan, suggestion }) => {
          const cat = lookup.category(suggestion.categoryId)
          return (
            <div key={suggestion.planId} className={styles.row}>
              <div className={styles.info}>
                <span className={styles.desc}>
                  <CategoryIcon icon={cat?.icon} name={cat?.name ?? suggestion.description} />{' '}
                  {suggestion.description}
                </span>
                <span className={styles.meta}>
                  Payment {suggestion.installmentIndex}/{suggestion.totalCount} ·{' '}
                  {formatCents(suggestion.amountCents)} · Final {fullMonthLabel(finalBudgetMonth(plan))}
                </span>
              </div>
              <div className={styles.actions}>
                <button
                  type="button"
                  className={styles.addBtn}
                  onClick={() => onAdd(toSeed(suggestion))}
                  aria-label="Log installment payment"
                >
                  +
                </button>
              </div>
            </div>
          )
        })}
      </Card>
    </>
  )
}
