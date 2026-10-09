import { currencyWord, formatCentsCompact, type MoneyFormat } from '../../../engine'
import { useMoneyFormat } from '../../hooks/moneyFormatContext'
import { onAccountCents } from './bothMoneys'
import styles from './goals.module.css'

/** Said in the owner's money: the currency's name, and the one example worked out in their number style. */
const buildTerms = (format: MoneyFormat): { term: string; body: string }[] => {
  const cur = format.symbol
  const word = currencyWord(format)
  const hundredK = formatCentsCompact(10_000_000, format)
  const grown = formatCentsCompact(onAccountCents(10_000_000, 10, 0.02), format)
  return [
  {
    term: 'House purchase year',
    body: 'When you buy: null = never; 0 = already own (capital allocated); N > 0 = buy after year N. In that year the model grows your portfolio first, then withdraws down payment plus purchase fees. Equity appears in the composition chart — the invested line dip is not your total net worth falling by that amount.',
  },
  {
    term: 'House price',
    body: "The price you enter is today's. A house bought in year 8 has had eight years to rise, by what houses beat inflation by, so the plan buys it at the price shown under the field.",
  },
  {
    term: 'Purchase fees',
    body: `Notary, agency, and closing costs (default ${cur}500 in demo). Withdrawn from the invested portfolio together with the down payment in the purchase year.`,
  },
  {
    term: 'Scenario',
    body: 'A saved set of choices (return, contribution, horizon, house plans). Each one is a colored line on the projection so you can compare futures side by side.',
  },
  {
    term: 'Monthly investing',
    body: `What leaves your account for your investments each month, as you send it. The plan counts in the ${word} of its start year, so each year's payments are brought back by the assumed inflation: an amount that stays the same counts for less every year. A change from a date sets a new amount from that month on. Each year's payments are added at the end of that year, a little cautious: money sent through the year would earn a bit more.`,
  },
  {
    term: `The plan's ${word} and your account`,
    body: `Two ways to write the same amount. The plan counts in the ${word} of its start year, so '2026 ${word}' means what that many ${word} bought in 2026, and an amount in them does not shrink as time passes. Your account shows the ${word} of the day, so the same worth is a bigger number later: at 2% a year, ${hundredK} of 2026 ${word} reads about ${grown} on your account in 2036. Charts and figures say which one they use. The Nominal view draws what the account will read, and the Purchasing power view draws the plan's ${word}.`,
  },
  {
    term: 'Real return',
    body: `The yearly growth the plan assumes for the invested portfolio after inflation, so every projected figure and the FI target are in the plan's ${word} (the ${word} of its start year). Milestones are the exception: they are amounts you want to see on your account, so the plan is counted after inflation to date them. Check-ins are broker balances in the money of their day, and Progress deflates them before comparing, at the assumed inflation set in Assumptions. The chart's Nominal view does the reverse and inflates the projection at that same rate, and can preview another one without saving it. A new plan starts at 5%, about what world stocks have returned over the very long run after inflation; many forecasts are lower.`,
  },
  {
    term: 'Horizon (years)',
    body: 'How far the projection runs: years 0 through your horizon. The portfolio and housing settings apply over this window. FI is also searched within it.',
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
    body: 'The share of your portfolio you would spend each year after FI. 4% is the common rule of thumb for money that has to last about 30 years; lower is more conservative (spend less, higher FI target), and a longer retirement calls for a lower rate. Does not affect accumulation years before FI.',
  },
  {
    term: 'Years the money must last',
    body: 'How long the invested money has to pay for your spending after FI. The FI drawdown runs for it, and it sets the usual guide for the withdrawal rate: 4% up to 35 years, 3,5% up to 49 and 3,25% from 50. Changing it moves the rate to the guide, unless you have set the rate yourself.',
  },
  {
    term: 'Market bounce',
    body: "How far a single year's return strays from the typical one. The plan assumes the typical return every year, which no run of years pays. The spread card replays the plan in 10.000 different markets, each year's return the typical one times a luck factor with this bounce (15% by default, about world stocks), and shows where the middle half of them and 8 in 10 of them end up. You set it in the Market bounce card in Assumptions. A mixed portfolio bounces less but also grows less: choose a lower bounce here and a lower return on the plan.",
  },
  {
    term: 'Chance the money lasts',
    body: "In how many of 100 different markets the money lasts all the years you asked for. Each run starts at the FI target, takes the spending out every year and grows what is left by the typical return times a luck factor with the market bounce. With a typical return of 5% and a bounce of 15%, 4% over 30 years lasts in about 86 of 100: the other 14 are the runs with bad early years. A lower rate, a higher return or a smaller bounce lasts more often, and a longer retirement less often. It is a picture of the plan's own market, not a promise.",
  },
  {
    term: 'Drawdown',
    body: "What happens to the portfolio after you reach FI: it keeps growing with returns while you withdraw your annual spend each year. It takes the plan's return every year, so it is an illustration, not a forecast: a bad run of early years would leave less. Chart years count from the FI year, not from today. If FI is not reached within the horizon, the drawdown chart shows the target only, and the chance the money lasts is still said under its title, since it starts at the target.",
  },
  ]
}

/** Collapsible glossary so the Goals jargon is explained in place, on demand. */
export function GoalsExplainer() {
  const terms = buildTerms(useMoneyFormat())
  return (
    <details className={styles.controlSection}>
      <summary className={styles.controlSummary}>What do these terms mean?</summary>
      <div className={styles.controlBody}>
        <dl className={styles.glossary}>
          {terms.map((t) => (
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
