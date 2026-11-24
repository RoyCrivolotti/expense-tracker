import { useState } from 'react'
import type { WealthAccount, WealthCheckin } from '../../../types'
import type { ExpenseActions } from '../../actions'
import { Card } from '../../components/primitives'
import { DateInput } from '../../components/DateInput'
import { todayIso } from '../../components/transactionFormState'
import { useMoneyFormat } from '../../hooks/moneyFormatContext'
import { useHoldUpdateReload } from '../../hooks/updateReloadHold'
import { BalanceRow, CheckinActions, NoteField } from './CheckinFields'
import { useCheckinDraft } from './useCheckinDraft'
import styles from './progress.module.css'
import goalStyles from './goals.module.css'

interface Props {
  accounts: WealthAccount[]
  /**
   * The previous check-in, whose balances the form starts from. Most accounts move a
   * little between check-ins, so editing last month's figure beats retyping every one
   * from zero, and an account nothing changed in needs no touch at all.
   */
  previous?: WealthCheckin | null
  actions: ExpenseActions
  onDone?: () => void
}

/** Inline rather than a dialog, so no focus trap marks it as open: it holds an app update back itself. */
export function CheckinFormSheet(props: Props) {
  useHoldUpdateReload()
  return <CheckinForm {...props} />
}

function CheckinForm({ accounts, previous = null, actions, onDone }: Props) {
  const format = useMoneyFormat()
  // Local date, not UTC. East of UTC these differ for part of every day, and a UTC
  // "today" would default the field to yesterday and cap it there — leaving the user's
  // actual today unselectable while the grid still marks it as today. The server's one
  // day of slack exists to accept exactly this.
  const today = todayIso()
  const [date, setDate] = useState(today)
  const [note, setNote] = useState('')
  const active = accounts.filter((a) => !a.archived)

  const { entries, submitting, error, empty, handleSubmit, readBalance, setEntry, commitBalance, holdOnEntry } =
    useCheckinDraft({ active, previous, actions, format, date, note, onDone })

  const accountById = (id: number) => active.find((a) => a.id === id)

  if (active.length === 0) {
    return (
      <Card>
        <h3 className={goalStyles.sectionTitle}>New check-in</h3>
        <p className={styles.emptyHint}>Add at least one wealth account before logging a check-in.</p>
      </Card>
    )
  }

  return (
    <Card>
      <h3 className={goalStyles.sectionTitle}>New check-in</h3>
      <div className={styles.checkinForm}>
        <div className={styles.formField}>
          <span className={styles.formLabel}>Date</span>
          <DateInput value={date} ariaLabel="Date" max={today} onChange={setDate} />
        </div>

        <div className={styles.formField}>
          <span className={styles.formLabel}>Account values</span>
          {entries.map((entry) => {
            const acc = accountById(entry.accountId)
            if (!acc) return null
            return (
              <div key={entry.accountId} className={styles.accountValueRow}>
                <BalanceRow
                  acc={acc}
                  entry={entry}
                  format={format}
                  holdOnEntry={holdOnEntry}
                  readBalance={readBalance}
                  setEntry={setEntry}
                  commitBalance={commitBalance}
                />
              </div>
            )
          })}
        </div>

        <NoteField note={note} setNote={setNote} />

        <CheckinActions
          error={error}
          empty={empty}
          submitting={submitting}
          date={date}
          handleSubmit={handleSubmit}
          onDone={onDone}
        />
      </div>
    </Card>
  )
}
