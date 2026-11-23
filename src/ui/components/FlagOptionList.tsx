import type { Flag } from '../../types'
import { FlagIcon } from '../icons'
import styles from './FlagPicker.module.css'

/** The "No flag" row and one row per selectable flag. */
export function FlagOptionList({
  value,
  options,
  choose,
}: {
  value: number | null
  options: Flag[]
  choose: (flagId: number | null) => void
}) {
  return (
    <ul className={styles.list}>
      <li>
        <button type="button" className={styles.option} onClick={() => choose(null)} aria-pressed={value === null}>
          <span className={`${styles.swatch} ${styles.swatchNone}`} aria-hidden />
          <span className={styles.optionBody}>
            <span className={styles.optionName}>No flag</span>
          </span>
          {value === null ? (
            <span className={styles.tick} aria-hidden>
              ✓
            </span>
          ) : null}
        </button>
      </li>
      {options.map((flag) => (
        <li key={flag.id}>
          <button
            type="button"
            className={styles.option}
            onClick={() => choose(flag.id)}
            aria-pressed={value === flag.id}
          >
            <span className={styles.swatch} style={{ color: flag.color }} aria-hidden>
              <FlagIcon fill="currentColor" strokeWidth={1.5} />
            </span>
            <span className={styles.optionBody}>
              <span className={styles.optionName}>
                {flag.name}
                {!flag.active ? <span className={styles.archived}> · archived</span> : null}
              </span>
              {flag.description ? <span className={styles.optionDesc}>{flag.description}</span> : null}
            </span>
            {value === flag.id ? (
              <span className={styles.tick} aria-hidden>
                ✓
              </span>
            ) : null}
          </button>
        </li>
      ))}
    </ul>
  )
}
