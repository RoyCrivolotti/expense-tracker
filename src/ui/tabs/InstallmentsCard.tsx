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
import { Presence } from '../components/Presence'
import { InstallmentPlansModal } from '../definitions/InstallmentPlansModal'
import { EXIT_MS } from '../hooks/motion'
import { useMoneyFormat } from '../hooks/moneyFormatContext'
import { shortDayLabel } from '../format'
import styles from './InstallmentsCard.module.css'

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
  /** The pill's wording, date included, so the row never says the state twice. */
  label: string
  tone: 'success' | 'warning'
}

// A card charge is dated when it hit the card, but it is paid when the statement is.
function paidLabel(
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
    return { label: `Forecast for ${shortMonthLabel(transaction.budgetMonth)}`, tone: 'warning' }
  }
  return { label: paidLabel(transaction, account, statements), tone: 'success' }
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

// One markup, three layouts: the card's container queries flex the two lines on a
// phone, grid them on a narrow card, and dissolve the wrappers into a table row on a
// wide one. Source order is the reading order: name, position, account, amount, then
// last payment and status.
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
      <span className={styles.lineOne}>
        <span className={styles.plan}>
          <span className={styles.desc}>
            <CategoryIcon icon={icon} name={categoryName} /> {name}
          </span>
          <span className={styles.position}>
            <span className={styles.srOnly}>Payment </span>
            {position}
          </span>
        </span>
        {chip ? <span className={styles.chip}>{chip}</span> : null}
        <span className={styles.amount}>{amount}</span>
      </span>
      <span className={styles.lineTwo}>
        <span className={styles.last}>
          <span className={styles.lastLabel}>Last payment</span> {lastPayment}
        </span>
        <span className={styles.trail}>
          <span className={styles.status}>
            <Pill tone={status.tone}>{status.label}</Pill>
          </span>
          {trailing}
        </span>
      </span>
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
                  position={`${installmentIndex}/${plan.totalCount}`}
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
                  label: `Due ${suggestion.dueDateKnown ? shortDayLabel(suggestion.predictedDate) : 'this month'}`,
                  tone: 'warning',
                }}
                position={`${suggestion.installmentIndex}/${suggestion.totalCount}`}
                chip={accountChip(model.lookup.account(suggestion.accountId))}
                lastPayment={lastPayment}
                trailing={
                  <button
                    type="button"
                    className={styles.addBtn}
                    onClick={() => actions.onAdd(toSeed(suggestion))}
                    aria-label={`Log installment payment for ${suggestion.description}`}
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
      <Presence show={managing} exitMs={EXIT_MS.sheet}>
        <InstallmentPlansModal
          model={model}
          actions={actions}
          onClose={() => setManaging(false)}
        />
      </Presence>
    </>
  )
}
