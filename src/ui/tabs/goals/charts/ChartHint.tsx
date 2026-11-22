import { Disclosure } from '../Disclosure'
import styles from '../goals.module.css'

/** The line above a chart: what its euros are, then what to know to read it. */
export interface HintText {
  lead: string
  rest: string
}

/**
 * The explanation above the hero chart. For a plan with no saved scenario everything but what the euros are is folded
 * behind "How to read this chart": that person has not met a purchase year or a return band yet, and a paragraph of them
 * above the first chart they see is the page's hardest sentence. Anyone with a saved scenario keeps it open, as it was.
 */
export function ChartHint({
  hint,
  isHero,
  savedScenarios,
}: {
  hint: HintText | null
  isHero: boolean
  savedScenarios: number
}) {
  if (hint === null) return null
  if (!isHero || savedScenarios > 0) return <p className={styles.chartHint}>{`${hint.lead} ${hint.rest}`}</p>
  return (
    <>
      <p className={styles.chartHint}>{hint.lead}</p>
      <Disclosure title="How to read this chart">
        <p>{hint.rest}</p>
      </Disclosure>
    </>
  )
}
