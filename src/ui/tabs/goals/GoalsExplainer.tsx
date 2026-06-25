import styles from './goals.module.css'

const TERMS: { term: string; body: string }[] = [
  {
    term: 'House purchase year',
    body: 'When you buy: null = never; 0 = already own (capital allocated); N > 0 = buy after year N. In that year the model grows your portfolio first, then withdraws down payment plus purchase fees. Equity appears in the composition chart — the invested line dip is not your total net worth falling by that amount.',
  },
  {
    term: 'Purchase fees',
    body: 'Notary, agency, and closing costs (default €500 in demo). Withdrawn from the invested portfolio together with the down payment in the purchase year.',
  },
  {
    term: 'Scenario',
    body: 'A saved set of assumptions (return, contribution, horizon, house plans). Each one is a colored line on the projection so you can compare futures side by side.',
  },
  {
    term: 'Horizon (years)',
    body: 'How far the projection runs: years 0 through your horizon. Portfolio and housing assumptions apply over this window. FI is also searched within it.',
  },
  {
    term: 'FIRE / FI',
    body: 'Financial Independence: the point where your invested portfolio is large enough to cover your spending without a salary. "Retire Early" is optional. FI is found within your horizon if contributions and return get you there in time.',
  },
  {
    term: 'FI target',
    body: 'The portfolio size that makes you financially independent: annual spend at FI divided by the withdrawal rate. Used for progress today, but withdrawals in charts only start once FI is reached within the horizon.',
  },
  {
    term: 'Safe withdrawal rate (SWR)',
    body: 'The share of your portfolio you would spend each year after FI. 4% is the common rule of thumb; lower is more conservative (spend less, higher FI target). Does not affect accumulation years before FI.',
  },
  {
    term: 'Drawdown',
    body: 'What happens to the portfolio after you reach FI: it keeps growing with returns while you withdraw your annual spend each year. Chart years count from the FI year, not from today. If FI is not reached within the horizon, the drawdown chart shows the target only.',
  },
]

/** Collapsible glossary so the Goals jargon is explained in place, on demand. */
export function GoalsExplainer() {
  return (
    <details className={styles.controlSection}>
      <summary className={styles.controlSummary}>What do these terms mean?</summary>
      <div className={styles.controlBody}>
        <dl className={styles.glossary}>
          {TERMS.map((t) => (
            <div key={t.term} className={styles.glossaryItem}>
              <dt className={styles.glossaryTerm}>{t.term}</dt>
              <dd className={styles.glossaryBody}>{t.body}</dd>
            </div>
          ))}
        </dl>
      </div>
    </details>
  )
}
