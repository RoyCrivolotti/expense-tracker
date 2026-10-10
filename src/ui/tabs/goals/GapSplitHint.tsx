import type { GapReading, GapSplit, MergedReason } from '../../../engine'
import { formatCentsCompact, startExplainsGap, wholeEuros } from '../../../engine'
import type { MoneyFormat } from '../../../engine/money'
import { formatCheckinDate } from './checkinDate'
import { behindFromTheMarket, gapRows } from './gapRows'
import { planMoneyLabel } from './planMoneyLabel'
import styles from './progress.module.css'
import goalStyles from './goals.module.css'

const hintStyle = { fontSize: '0.8125rem', color: 'var(--color-text-muted)', margin: 0 } as const

/** Why saving and the market are said together, and what would tell them apart. */
function mergedNote(reason: MergedReason, since: string): string {
  if (reason === 'none-recorded') {
    return `Shown together because nothing is recorded as an investment since ${since}: what you put in cannot be told from the market.`
  }
  if (reason === 'event-unrecorded') {
    return 'Shown together because the plan has a house payment or a one-off amount in this period and no matching withdrawal is recorded. Record it as an investment withdrawal to tell investing from the market.'
  }
  return 'Shown together because the balance grew faster than markets usually give, which is usually money moved in that is not recorded.'
}

function signed(euros: number, format: MoneyFormat): string {
  return `${euros > 0 ? '+' : '−'}${formatCentsCompact(Math.abs(euros) * 100, format)}`
}

function headline(split: GapSplit, format: MoneyFormat): string {
  const [gap] = wholeEuros([split.gapCents])
  const money = formatCentsCompact(Math.abs(gap!) * 100, format)
  if (split.verdict === 'on-track') return gap === 0 ? 'On track' : `On track, ${signed(gap!, format)} from the plan`
  return `${split.verdict === 'ahead' ? 'Ahead of' : 'Behind'} the plan by ${money}`
}

function Rows({ split, format }: { split: GapSplit; format: MoneyFormat }) {
  return (
    <ul className={styles.gapRows}>
      {gapRows(split).map((row) => (
        <li key={row.key} className={`${styles.gapRow} ${row.muted ? styles.gapRowMuted : ''}`}>
          <span>{row.label}</span>
          <span className={`${styles.gapAmount} ${row.muted ? '' : row.euros > 0 ? styles.gapAmountUp : styles.gapAmountDown}`}>
            {signed(row.euros, format)}
          </span>
        </li>
      ))}
    </ul>
  )
}

function Notes({ split }: { split: GapSplit }) {
  return (
    <>
      {split.merged ? <p style={hintStyle}>{mergedNote(split.merged, formatCheckinDate(split.fromDate))}</p> : null}
      {split.recordedShort ? (
        <p style={hintStyle}>Anything you put in that is not recorded as an investment counts as the market.</p>
      ) : null}
      {split.accountsChanged ? (
        <p style={hintStyle}>
          An investment account was opened or emptied between these check-ins, so money moved between accounts counts as
          the market.
        </p>
      ) : null}
    </>
  )
}

/**
 * Why the latest check-in is ahead of or behind the plan, in the parts that add up to the gap: where it
 * started, how much was put in, what the market paid, and a small line for how the plan counts a year.
 * When the start is what explains the gap, the restart is offered with it.
 */
export function GapSplitHint({
  reading,
  planStartDate,
  format,
  onRebaseline,
}: {
  reading: GapReading
  planStartDate: string | null
  format: MoneyFormat
  onRebaseline: (() => void) | undefined
}) {
  if (reading.kind === 'unavailable') {
    if (reading.reason !== 'few-checkins' && reading.reason !== 'too-close') return null
    return (
      <p style={hintStyle}>
        Two check-ins a month or more apart, from the plan's start on, show where the gap comes from.
      </p>
    )
  }
  return (
    <div className={styles.gapSplit}>
      <p style={{ ...hintStyle, color: 'inherit' }}>
        <strong>{headline(reading, format)}</strong> (in {planMoneyLabel(planStartDate, format)}), from:
      </p>
      <Rows split={reading} format={format} />
      {behindFromTheMarket(reading) ? (
        <p style={hintStyle}>
          What you put in is about what the plan asks, or more, so this gap comes from the market and where the plan started,
          not from your investing.
        </p>
      ) : null}
      <Notes split={reading} />
      {startExplainsGap(reading) ? (
        <>
          <p style={hintStyle}>
            At least half of this gap comes from where the plan started. Re-baselining starts the plan from your latest
            check-in, so from there the gap comes from what you invest and how markets do.
          </p>
          {onRebaseline ? (
            <button type="button" className={goalStyles.btn} onClick={onRebaseline}>
              Re-baseline from latest check-in
            </button>
          ) : null}
        </>
      ) : null}
    </div>
  )
}
