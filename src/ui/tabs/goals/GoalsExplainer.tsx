import styles from './goals.module.css'

const TERMS: { term: string; body: string }[] = [
  {
    term: 'Scenario',
    body: 'A saved set of assumptions (return, contribution, horizon, house plans). Each one is a colored line on the projection so you can compare futures side by side.',
  },
  {
    term: 'FIRE / FI',
    body: 'Financial Independence: the point where your invested portfolio is large enough to cover your spending without a salary. "Retire Early" is optional — FI just means work becomes a choice.',
  },
  {
    term: 'FI target',
    body: 'The portfolio size that makes you financially independent. Calculated as your annual spend divided by the safe withdrawal rate.',
  },
  {
    term: 'Safe withdrawal rate (SWR)',
    body: 'The share of your portfolio you can spend each year and reasonably expect it to last. 4% is the common rule of thumb; lower is more conservative.',
  },
  {
    term: 'Drawdown',
    body: 'What happens to the portfolio after you reach FI and start living off it: it keeps growing with returns while you withdraw your spending each year.',
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
