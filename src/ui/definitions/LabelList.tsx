import { useState } from 'react'
import type { ExpenseModel } from '../useExpenseData'
import type { ExpenseActions } from '../actions'
import { Card, SectionTitle } from '../components/primitives'
import { LabelGlyph } from '../components/LabelGlyph'
import { Presence } from '../components/Presence'
import { EXIT_MS } from '../hooks/motion'
import { LabelsModal } from './LabelsModal'
import styles from './definitions.module.css'
// Reused for .rowGlyph only: the settings-row glyph sizing is identical to the
// flag list's own, and duplicating one class was not worth a second stylesheet.
import flagStyles from './FlagsModal.module.css'

/** Settings-side list of labels. Mirrors FlagList exactly. */
export function LabelList({ model, actions }: { model: ExpenseModel; actions: ExpenseActions }) {
  const [managing, setManaging] = useState(false)
  const labels = model.dataset.labels

  return (
    <>
      <SectionTitle>Labels</SectionTitle>
      <Card>
        {labels.length === 0 ? (
          <p className={styles.deleteNote}>
            No labels yet. Labels mark what a transaction permanently belongs to — a trip, a
            project — and stay even after any flag on it clears.
          </p>
        ) : (
          labels.map((label) => (
            <div
              key={label.id}
              className={label.active ? styles.row : `${styles.row} ${styles.inactive}`}
            >
              <div className={styles.rowMain}>
                <span className={styles.rowName}>
                  <LabelGlyph label={label} className={flagStyles.rowGlyph} /> {label.name}
                </span>
                <span className={styles.rowMeta}>
                  {label.description ? `${label.description} · ` : ''}
                  {model.dataset.transactions.filter((t) => t.labelIds?.includes(label.id)).length}{' '}
                  tagged
                </span>
              </div>
            </div>
          ))
        )}
        <button type="button" className={styles.addBtn} onClick={() => setManaging(true)}>
          {labels.length === 0 ? '+ Add label' : 'Manage labels'}
        </button>
      </Card>
      <Presence show={managing} exitMs={EXIT_MS.sheet}>
        <LabelsModal model={model} actions={actions} onClose={() => setManaging(false)} />
      </Presence>
    </>
  )
}
