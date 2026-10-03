import { GoalsExplainer } from './GoalsExplainer'
import styles from './goals.module.css'

/**
 * Plan's intro and glossary. They are reference, and the chart is what Plan is for, so neither
 * layout leads with them: both put them last on the page, under the charts and the controls
 * whose words the glossary explains.
 */
export function GoalsIntro() {
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
