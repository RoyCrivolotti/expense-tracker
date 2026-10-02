import type { NewGoalScenario } from '../../../data/dataSource'
import { AdjustSectionNav, type UnsavedActions } from './AdjustSectionNav'
import { NetWorthMiniChart } from './charts/NetWorthMiniChart'
import { ADJUST_STACK_ID } from './scrollToAdjustSection'
import { useGoalsNarrow } from './useGoalsNarrow'
import styles from './goals.module.css'

/**
 * The draft's chart and the section chips, pinned under the view row in Adjust on a phone.
 * CSS hides the block from 900px up, but a hidden chart still recomputes a projection nobody
 * sees, so a window widened past the phone layout drops it rather than hiding it.
 */
export function AdjustStack({
  draft,
  unsaved,
}: {
  draft: NewGoalScenario
  unsaved?: UnsavedActions | undefined
}) {
  const narrow = useGoalsNarrow()
  if (!narrow) return null
  return (
    <div id={ADJUST_STACK_ID} className={`${styles.areaMini} ${styles.fadeBelow}`}>
      <NetWorthMiniChart draft={draft} />
      <AdjustSectionNav unsaved={unsaved} />
    </div>
  )
}
