import { useState, type ReactNode } from 'react'
import type { Account, AccountStatement, InstallmentPlan, Transaction } from '../../types'
import type { ExpenseActions, TransactionSeed } from '../actions'
import type { ExpenseModel } from '../useExpenseData'
import {
  finalBudgetMonth,
  nextInstallmentSuggestion,
  paidInstallmentInMonth,
  type InstallmentSuggestion,
} from '../../engine'
import { formatCents } from '../../engine/money'
import { shortMonthFullYearLabel, shortMonthLabel } from '../../engine/dates'
import { Card, Pill, SectionTitle } from '../components/primitives'
import { CategoryIcon } from '../components/CategoryIcon'
import { InstallmentPlansModal } from '../definitions/InstallmentPlansModal'
import { useMoneyFormat } from '../hooks/moneyFormatContext'
import { STATUS_LABEL, shortDayLabel } from '../format'
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
  | { kind: 'logged'; plan: InstallmentPlan; transaction: Transaction; installmentIndex: number }
  | { kind: 'due'; plan: InstallmentPlan; suggestion: InstallmentSuggestion }

interface RowStatus {
  /** Left-hand wording, with the date the state refers to. */
  text: string
  /** The single pill on the right. */
  label: string
  tone: 'success' | 'warning'
}

// A card charge is dated when it hit the card, but it is paid when the statement is.
function paidText(
  transaction: Transaction,
  account: Account | undefined,
  statements: AccountStatement[],
): string {
  if (account?.settlement !== 'deferred') return `Paid ${shortDayLabel(transaction.date)}`
  const paidOn = statements.find(
    (s) => s.accountId === transaction.accountId && s.yearMonth === transaction.budgetMonth,
  )?.paidOn
  return paidOn ? `Paid ${shortDayLabel(paidOn)}` : 'Paid'
}

function loggedStatus(
  transaction: Transaction,
  account: Account | undefined,
  statements: AccountStatement[],
): RowStatus {
  if (transaction.status === 'forecast') {
    return {
      text: `Forecast for ${shortMonthLabel(transaction.budgetMonth)}`,
      label: STATUS_LABEL.forecast,
      tone: 'warning',
    }
  }
  return { text: paidText(transaction, account, statements), label: 'Paid', tone: 'success' }
}

function accountChip(account: Account | undefined): string | null {
  if (!account) return null
  return account.settlement === 'deferred' ? 'Credit' : 'Debit'
}

interface RowContentProps {
  name: string
  icon: string | undefined
  categoryName: string
  amount: string
  status: RowStatus
  position: string
  chip: string | null
  lastPayment: string
  /** Sits beside the pill, for the one state that needs a button. */
  trailing?: ReactNode
}

function RowContent({
  name,
  icon,
  categoryName,
  amount,
  status,
  position,
  chip,
  lastPayment,
  trailing,
}: RowContentProps) {
  return (
    <>
      <div className={styles.info}>
        <span className={styles.desc}>
          <CategoryIcon icon={icon} name={categoryName} /> {name}
        </span>
        <span className={styles.meta}>
          {status.text} · {position}
        </span>
        <span className={styles.meta}>
          {chip ? <span className={styles.chip}>{chip}</span> : null}
          Last payment {lastPayment}
        </span>
      </div>
      <div className={styles.rail}>
        <span className={styles.amount}>{amount}</span>
        <div className={styles.actions}>
          <Pill tone={status.tone}>{status.label}</Pill>
          {trailing}
        </div>
      </div>
    </>
  )
}

export function InstallmentsCard({ model, actions, month }: Props) {
  const format = useMoneyFormat()
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
      <Card>
        <p className={styles.meta}>
          {rows.length > 0
            ? 'Scheduled plan payments for this month, not predictions.'
            : 'Nothing scheduled this month.'}
        </p>
        {rows.map((row) => {
          const { plan } = row
          const cat = model.lookup.category(plan.categoryId)
          const lastPayment = shortMonthFullYearLabel(finalBudgetMonth(plan))

          if (row.kind === 'logged') {
            const { transaction, installmentIndex } = row
            const account = model.lookup.account(transaction.accountId)
            return (
              <button
                key={plan.id}
                type="button"
                className={`${styles.row} ${styles.rowButton}`}
                onClick={() => actions.onEdit(transaction)}
              >
                <RowContent
                  name={plan.description}
                  icon={cat?.icon}
                  categoryName={cat?.name ?? plan.description}
                  amount={formatCents(transaction.amountCents, format)}
                  status={loggedStatus(transaction, account, model.dataset.accountStatements)}
                  position={`${installmentIndex} of ${plan.totalCount}`}
                  chip={accountChip(account)}
                  lastPayment={lastPayment}
                />
              </button>
            )
          }

          const { suggestion } = row
          return (
            <div key={plan.id} className={styles.row}>
              <RowContent
                name={suggestion.description}
                icon={cat?.icon}
                categoryName={cat?.name ?? suggestion.description}
                amount={formatCents(suggestion.amountCents, format)}
                status={{
                  text: `Due ${suggestion.dueDateKnown ? shortDayLabel(suggestion.predictedDate) : 'this month'}`,
                  label: 'Due',
                  tone: 'warning',
                }}
                position={`${suggestion.installmentIndex} of ${suggestion.totalCount}`}
                chip={accountChip(model.lookup.account(suggestion.accountId))}
                lastPayment={lastPayment}
                trailing={
                  <button
                    type="button"
                    className={styles.addBtn}
                    onClick={() => actions.onAdd(toSeed(suggestion))}
                    aria-label="Log installment payment"
                  >
                    +
                  </button>
                }
              />
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
