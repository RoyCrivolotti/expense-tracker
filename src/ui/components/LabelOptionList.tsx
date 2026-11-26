import type { Label } from '../../types'
import styles from './FlagPicker.module.css'

/** The selectable labels as toggle rows, or the empty-state line when there are none and none can be created. */
export function LabelOptionList({
  value,
  options,
  canCreate,
  onToggle,
}: {
  value: number[]
  options: Label[]
  canCreate: boolean
  onToggle: (labelId: number) => void
}) {
  return options.length > 0 ? (
    <ul className={styles.list}>
      {options.map((label) => {
        const selected = value.includes(label.id)
        return (
          <li key={label.id}>
            <button type="button" className={styles.option} onClick={() => onToggle(label.id)} aria-pressed={selected}>
              <span className={styles.swatch} style={{ background: label.color, borderRadius: '999px' }} aria-hidden />
              <span className={styles.optionBody}>
                <span className={styles.optionName}>
                  {label.name}
                  {!label.active ? <span className={styles.archived}> · archived</span> : null}
                </span>
                {label.description ? <span className={styles.optionDesc}>{label.description}</span> : null}
              </span>
              {selected ? (
                <span className={styles.tick} aria-hidden>
                  ✓
                </span>
              ) : null}
            </button>
          </li>
        )
      })}
    </ul>
  ) : !canCreate ? (
    <p className={styles.empty}>No labels to choose from. Add one under Settings &rarr; Labels.</p>
  ) : null
}
