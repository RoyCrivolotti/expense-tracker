import type { SeedIntro as Intro } from '../actions'
import styles from './Review.module.css'

/** Why the payment needs a look. A payment with a duplicate block under this says nothing when that is the only doubt. */
function Why({ reasons, duplicate }: { reasons: string[]; duplicate: boolean }) {
  if (reasons.length === 0 && duplicate) return null
  return (
    <p className={styles.why}>
      {reasons.length > 0 ? (
        <>
          <b>Needs a look</b> because {reasons.join(', and ')}.
        </>
      ) : (
        'Nothing in doubt. Filled in the way you added it before.'
      )}
    </p>
  )
}

/**
 * What the review view opens with, above the fields: the bank's message as it arrived, one sentence on why the
 * payment needs a look, and for a bill that may be waiting twice, what the other payment is. `duplicate` is true when
 * the form shows an entry the payment may duplicate, which says that reason itself.
 */
export default function SeedIntro({ intro, duplicate }: { intro: Intro; duplicate: boolean }) {
  return (
    <>
      <section className={styles.from} aria-label="From your bank">
        <small className={styles.fromWhen}>From your bank · {intro.arrived}</small>
        {intro.message ? <p className={styles.fromMessage}>{intro.message}</p> : null}
        <Why reasons={intro.reasons} duplicate={duplicate} />
      </section>
      {intro.pair ? <p className={styles.pairNote}>{intro.pair}</p> : null}
    </>
  )
}

/** The lines between the duplicate block and the fields: the monthly payment it looks like, a foreign amount. */
export function SeedNotes({ intro }: { intro: Intro }) {
  return (
    <>
      {intro.notes.map((note) => (
        <p key={note.text} className={note.warn ? styles.pairNote : styles.series}>
          {note.text}
        </p>
      ))}
    </>
  )
}
