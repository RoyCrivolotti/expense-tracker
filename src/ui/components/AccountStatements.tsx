import { fullMonthLabel } from '../../engine'
import { isStatementPaid } from '../../engine/status'
import type { Account } from '../../types'
import type { ExpenseModel } from '../useExpenseData'
import { findPaidOn } from './statementPaidOn'
import { StatementSummaryRow } from './StatementSummaryRow'
import styles from './StatementToggles.module.css'

interface GroupProps {
  account: Account
  months: string[]
  model: ExpenseModel
  pending: string | null
  chargeCents: (
    accountId: number,
    yearMonth: string,
  ) => number
  onOpen: (
    accountId: number,
    yearMonth: string,
  ) => void
}

/** One card's name over its monthly statement rows. */
export function AccountStatements({ account, months, model, pending, chargeCents, onOpen }: GroupProps) {
  return (
    <div className={styles.account}>
      <div className={styles.accountName}>{account.name}</div>
      <div className={styles.months}>
        {months.map((m) => {
          const paid = isStatementPaid(model.dataset.accountStatements, account.id, m)
          const amountCents = chargeCents(account.id, m)
          const key = `${account.id}:${m}`
          return (
            <StatementSummaryRow
              key={m}
              name={fullMonthLabel(m)}
              amountCents={amountCents}
              paid={paid}
              paidOn={findPaidOn(model, account.id, m)}
              disabled={pending === key}
              {...(amountCents !== 0 ? { onPress: () => onOpen(account.id, m) } : {})}
            />
          )
        })}
      </div>
    </div>
  )
}
