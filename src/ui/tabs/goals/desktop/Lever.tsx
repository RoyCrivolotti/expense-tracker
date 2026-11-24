import { useCallback } from 'react'
import type { NewGoalScenario } from '../../../../data/dataSource'
import { useMoneyFormat } from '../../../hooks/moneyFormatContext'
import type { LeverSpec } from '../leverFields'
import { LeverBody } from './LeverBody'
import { StarButton } from './StarButton'
import styles from './planDesktop.module.css'

interface LeverProps {
  spec: LeverSpec
  draft: NewGoalScenario
  onChange: (patch: Partial<NewGoalScenario>) => void
  /** Takes the input out of the bar; absent where the bar cannot be changed. */
  onUnstar?: (() => void) | undefined
}

/**
 * One input in the levers bar: its name, its value as a big number to type over, and a slider
 * where the input has one in the panel (the percentages and the purchase year). Money and years
 * stay typed: a balance or a house price is a fact, not a dial.
 */
export function Lever({ spec, draft, onChange, onUnstar }: LeverProps) {
  const format = useMoneyFormat()
  const { key, short } = spec
  const value = draft[key]
  // A value that is already there is not an edit: it would make a new draft, and redraw the
  // charts, for nothing.
  const patch = useCallback(
    (next: number | null) => {
      if (next !== value) onChange({ [key]: next })
    },
    [key, onChange, value],
  )

  return (
    <div className={styles.lever}>
      <div className={styles.leverHead}>
        <span className={styles.leverLabel} title={short}>
          {short}
        </span>
        {onUnstar ? <StarButton filled label={`Remove ${short} from the bar`} onClick={onUnstar} /> : null}
      </div>
      <LeverBody spec={spec} draft={draft} value={value} patch={patch} format={format} />
    </div>
  )
}
