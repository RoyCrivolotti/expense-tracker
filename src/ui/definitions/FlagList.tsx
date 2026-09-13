import { useState } from 'react'
import type { ExpenseModel } from '../useExpenseData'
import type { ExpenseActions } from '../actions'
import { Card, SectionTitle } from '../components/primitives'
import { FlagGlyph } from '../components/FlagGlyph'
import { FlagsModal } from './FlagsModal'
import styles from './definitions.module.css'
import flagStyles from './FlagsModal.module.css'

/**
 * Settings-side list of flags. Mirrors the Categories/Accounts cards, but opens
 * the shared FlagsModal rather than ConfigModal — a flag needs a colour picker,
 * which the generic RecordForm field kinds do not cover.
 */
export function FlagList({ model, actions }: { model: ExpenseModel; actions: ExpenseActions }) {
  const [managing, setManaging] = useState(false)
  const flags = model.dataset.flags

  return (
    <>
      <SectionTitle>Flags</SectionTitle>
      <Card>
        {flags.length === 0 ? (
          <p className={styles.deleteNote}>
            No flags yet. Flags mark transactions you need to follow up on — expenses to claim
            back, say — and group them in the Transactions tab.
          </p>
        ) : (
          flags.map((flag) => (
            <div
              key={flag.id}
              className={flag.active ? styles.row : `${styles.row} ${styles.inactive}`}
            >
              <div className={styles.rowMain}>
                <span className={styles.rowName}>
                  <FlagGlyph flag={flag} className={flagStyles.rowGlyph} /> {flag.name}
                </span>
                <span className={styles.rowMeta}>
                  {flag.description ? `${flag.description} · ` : ''}
                  {model.dataset.transactions.filter((t) => t.flagId === flag.id).length} tagged
                </span>
              </div>
            </div>
          ))
        )}
        <button type="button" className={styles.addBtn} onClick={() => setManaging(true)}>
          {flags.length === 0 ? '+ Add flag' : 'Manage flags'}
        </button>
      </Card>
      {managing ? (
        <FlagsModal model={model} actions={actions} onClose={() => setManaging(false)} />
      ) : null}
    </>
  )
}
