import type { Flag } from '../../types'
import { FlagIcon } from '../icons'
import styles from './FlagGlyph.module.css'

/**
 * The flag marker on a transaction row. Display-only on purpose: rows render as
 * a <button> (or a <label> in select mode), so anything interactive here would
 * nest a control inside a control. Flagging happens in the editor, the batch
 * bar, or the Flagged card.
 */
export function FlagGlyph({ flag, className }: { flag: Flag; className?: string | undefined }) {
  return (
    <span
      className={`${styles.glyph} ${className ?? ''}`}
      style={{ color: flag.color }}
      title={flag.description ? `${flag.name} — ${flag.description}` : flag.name}
      aria-label={`Flagged: ${flag.name}`}
      role="img"
    >
      <FlagIcon fill="currentColor" strokeWidth={1.5} />
    </span>
  )
}

/** The same marker plus its name, for the Flagged card and the picker. */
export function FlagChip({ flag }: { flag: Flag }) {
  return (
    <span
      className={styles.chip}
      style={{
        color: flag.color,
        // Tinted from the flag's own colour so one palette reads correctly on
        // both themes, the way primitives.module.css tints Pill tones.
        background: `color-mix(in srgb, ${flag.color} 16%, transparent)`,
      }}
    >
      <span className={styles.chipIcon} aria-hidden>
        <FlagIcon fill="currentColor" strokeWidth={1.5} />
      </span>
      {flag.name}
    </span>
  )
}
