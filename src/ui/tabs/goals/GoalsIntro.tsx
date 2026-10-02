import { GoalsExplainer } from './GoalsExplainer'
import { useGoalsNarrow } from './useGoalsNarrow'
import styles from './goals.module.css'

interface GoalsIntroProps {
  /** Above Plan's content, or below it: on a phone the charts come first. */
  placement: 'top' | 'bottom'
  show: boolean
}

/**
 * Plan's intro and glossary. On a phone they sit below the charts and controls, since the
 * chart is what Chart is for and the intro would put it a screen down; elsewhere they lead.
 * Only the one at the placement that fits the screen renders, so the reading order and the Tab
 * order follow what is on screen.
 */
export function GoalsIntro({ placement, show }: GoalsIntroProps) {
  const narrow = useGoalsNarrow()
  if (!show || (placement === 'bottom') !== narrow) return null
  return (
    <>
      <p className={styles.intro}>
        Project your net worth and when you can reach financial independence. Horizon sets how far
        the projection runs and where FI is searched. Adjust the controls, save a scenario, then
        compare scenarios on the charts.
      </p>
      <GoalsExplainer />
    </>
  )
}
