import { GoalsExplainer } from './GoalsExplainer'
import { useGoalsNarrow } from './useGoalsNarrow'
import styles from './goals.module.css'

interface GoalsIntroProps {
  /**
   * Last in the sidebar, under the controls whose words the glossary explains, or last on the
   * page, which is where a phone has them.
   */
  placement: 'sidebar-end' | 'page-end'
}

/**
 * Plan's intro and glossary. They are reference, and the chart is what Plan is for, so neither
 * layout leads with them: a phone puts them below the charts and controls, a wide screen at the
 * end of the sidebar. Only the one at the placement that fits the screen renders, so the reading
 * order and the Tab order follow what is on screen.
 */
export function GoalsIntro({ placement }: GoalsIntroProps) {
  const narrow = useGoalsNarrow()
  if ((placement === 'page-end') !== narrow) return null
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
