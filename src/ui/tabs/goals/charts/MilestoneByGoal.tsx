import { useEffect, useRef, type CSSProperties } from 'react'
import type { Milestone } from '../../../../types'
import { milestoneName } from '../../../../engine'
import { BackIcon, ChevronIcon } from '../../../icons'
import { SegmentedControl } from '../../../components/SegmentedControl'
import { formatMoneyShort } from '../chartTheme'
import { useMoneyFormat } from '../../../hooks/moneyFormatContext'
import { scenarioInk } from '../scenarioInk'
import { cellText, gapLabel, longestHorizon, soonestFirst, type MilestoneRow, type YearsUnit } from './milestoneModel'
import styles from '../goals.module.css'

/**
 * The table turned the other way for a phone: one milestone at a time, and under it every path in
 * the order it gets there, with its whole name, a figure big enough to read, and how far ahead of
 * or behind the plan it is. `indices` are the milestones that can be picked (the ones every path
 * has already are left out, as in the table) and `index` is the one in hand.
 */
export function MilestoneByGoal({
  rows,
  milestones,
  indices,
  index,
  onIndex,
  unit,
  plan,
}: {
  rows: MilestoneRow[]
  milestones: Milestone[]
  indices: number[]
  index: number
  onIndex: (index: number) => void
  unit: YearsUnit
  /** The plan, while the table is comparing with it. */
  plan: MilestoneRow | null
}) {
  const format = useMoneyFormat()
  const picker = useRef<HTMLDivElement>(null)
  const position = indices.indexOf(index)
  const milestone = milestones[index]
  const longest = longestHorizon(rows)
  const amount = (m: Milestone) => formatMoneyShort(m.amountCents, format)

  // A chip picked with the arrows, or reached by the stepper, may be off the edge of the row.
  useEffect(() => {
    const chosen = picker.current?.querySelector<HTMLElement>('[aria-checked="true"]')
    chosen?.scrollIntoView?.({ inline: 'nearest', block: 'nearest' })
  }, [index])

  if (!milestone || position < 0) return null
  const step = (by: number) => {
    const next = indices[position + by]
    if (next !== undefined) onIndex(next)
  }
  const name = milestoneName(milestone)

  return (
    <div className={styles.byGoal}>
      <div ref={picker} className={styles.byGoalPicker}>
        <SegmentedControl
          layout="scroll"
          ariaLabel="Milestone"
          value={String(index)}
          onChange={(value) => onIndex(Number(value))}
          options={indices.map((i) => ({ value: String(i), label: amount(milestones[i] as Milestone) }))}
        />
      </div>
      <div className={styles.byGoalStep}>
        <button
          type="button"
          className={`${styles.byGoalArrow} tapActive`}
          aria-label="Previous milestone"
          disabled={position === 0}
          onClick={() => step(-1)}
        >
          <BackIcon aria-hidden="true" />
        </button>
        <div className={styles.byGoalTitle} aria-live="polite">
          <span className={styles.byGoalAmount}>{amount(milestone)}</span>
          <span className={styles.byGoalSub}>
            {name ? `${name} · ` : ''}
            {position + 1} of {indices.length}
          </span>
        </div>
        <button
          type="button"
          className={`${styles.byGoalArrow} tapActive`}
          aria-label="Next milestone"
          disabled={position === indices.length - 1}
          onClick={() => step(1)}
        >
          <ChevronIcon aria-hidden="true" />
        </button>
      </div>
      <p className={styles.byGoalOrder}>Soonest first</p>
      <ol className={styles.byGoalList} aria-label={`Paths in the order they reach ${amount(milestone)}`}>
        {soonestFirst(rows, index).map((row) => {
          const years = row.cells[index] ?? null
          const gap = gapLabel(row, plan, index)
          const share = years === null ? null : Math.max(0.04, Math.min(1, years / longest))
          return (
            <li key={row.id} className={styles.byGoalRow}>
              <span className={styles.swatch} style={{ background: scenarioInk(row.color) }} aria-hidden="true" />
              <span className={styles.byGoalName}>
                {row.name}
                {plan !== null && row.id === plan.id ? <span className={styles.matrixPlanTag}> plan</span> : null}
              </span>
              <span className={styles.byGoalValue}>
                {cellText(row, index, unit)}
                {gap ? (
                  <span className={gap.sooner ? `${styles.byGoalGap} ${styles.matrixSooner}` : styles.byGoalGap}>
                    {gap.text === '=' ? 'same as plan' : `${gap.text} vs plan`}
                  </span>
                ) : null}
              </span>
              <span
                className={years === null ? `${styles.byGoalMeter} ${styles.matrixBeyond}` : styles.byGoalMeter}
                style={share === null || years === 0 ? undefined : ({ '--share': share } as CSSProperties)}
                aria-hidden="true"
              />
            </li>
          )
        })}
      </ol>
    </div>
  )
}
