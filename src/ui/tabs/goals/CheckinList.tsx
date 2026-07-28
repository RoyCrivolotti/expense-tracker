import type { GoalScenario, WealthAccount, WealthCheckin } from '../../../types'
import type { ExpenseActions } from '../../actions'
import { Card } from '../../components/primitives'
import {
  checkinNetWorthCents,
  trackStatus,
} from '../../../engine'
import { useMoneyFormat } from '../../hooks/moneyFormatContext'
import { formatMoneyShort } from './chartTheme'
import styles from './progress.module.css'
import goalStyles from './goals.module.css'

interface Props {
  checkins: WealthCheckin[]
  accounts: WealthAccount[]
  activeScenario: GoalScenario | null
  actions: ExpenseActions
}

function fmtDate(d: string) {
  const [y, m, day] = d.split('-')
  const date = new Date(Number(y), Number(m) - 1, Number(day))
  return date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}

function accountName(id: number, accounts: WealthAccount[]) {
  return accounts.find((a) => a.id === id)?.name ?? `Account ${id}`
}

export function CheckinList({ checkins, accounts, activeScenario, actions }: Props) {
  const format = useMoneyFormat()

  const sorted = [...checkins].sort((a, b) => (b.checkinDate > a.checkinDate ? 1 : -1))

  return (
    <Card>
      <h3 className={goalStyles.sectionTitle}>History</h3>

      {sorted.length === 0 ? (
        <p className={styles.emptyHint}>No check-ins yet. Log your first snapshot above.</p>
      ) : (
        <div className={styles.checkinTimeline}>
          {sorted.map((c) => {
            const netWorth = checkinNetWorthCents(c, accounts)
            const status = activeScenario ? trackStatus(c, activeScenario, accounts) : null
            const ahead = status ? status.deltaCents >= 0 : null

            return (
              <div key={c.id} className={styles.checkinItem}>
                <div className={styles.checkinHeader}>
                  <span className={styles.checkinDate}>{fmtDate(c.checkinDate)}</span>
                  <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'baseline' }}>
                    <span className={styles.checkinTotal}>
                      {formatMoneyShort(netWorth, format)}
                    </span>
                    {status ? (
                      <span
                        className={[
                          styles.checkinDelta,
                          ahead ? styles.checkinDeltaAhead : styles.checkinDeltaBehind,
                        ].join(' ')}
                      >
                        {ahead ? '+' : ''}
                        {formatMoneyShort(status.deltaCents, format)}
                      </span>
                    ) : null}
                  </div>
                </div>

                {c.note ? (
                  <p style={{ fontSize: '0.8125rem', color: 'var(--color-text-muted)', margin: 0 }}>
                    {c.note}
                  </p>
                ) : null}

                {c.entries.length > 0 ? (
                  <div className={styles.checkinEntries}>
                    {c.entries.map((e) => (
                      <div key={e.accountId} className={styles.checkinEntry}>
                        <span>{accountName(e.accountId, accounts)}</span>
                        <span className={styles.checkinEntryValue}>
                          {formatMoneyShort(e.valueCents, format)}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : null}

                <div className={styles.checkinActions}>
                  <button
                    className={goalStyles.iconBtn}
                    aria-label="Delete check-in"
                    onClick={() => { void actions.deleteWealthCheckin(c.id) }}
                  >
                    ✕
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </Card>
  )
}
