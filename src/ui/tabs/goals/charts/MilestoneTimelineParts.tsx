import type { Milestone } from '../../../../types'
import { scenarioInk } from '../scenarioInk'
import type { MilestoneRow } from './milestoneModel'
import { DOT_Y, ROW_HEIGHT, type RowLayout } from './timelineModel'
import { at } from './timelineFrame'
import styles from '../goals.module.css'

export function Names({ rows }: { rows: MilestoneRow[] }) {
  return (
    <div className={styles.tlNames}>
      {rows.map((row) => (
        <div
          key={row.id}
          className={row.kind === 'fromToday' ? `${styles.tlName} ${styles.matrixFromToday}` : styles.tlName}
          title={row.name}
        >
          <span className={styles.milestoneScenarioNameRow}>
            <span className={styles.swatch} style={{ background: scenarioInk(row.color) }} />
            <span className={styles.milestoneScenarioName}>{row.name}</span>
          </span>
        </div>
      ))}
    </div>
  )
}

export function Axis({
  ticks,
  span,
  label,
  bottom,
}: {
  ticks: number[]
  span: number
  label: (t: number) => string
  bottom?: boolean
}) {
  return (
    <div className={bottom ? `${styles.tlAxis} ${styles.tlAxisBottom}` : styles.tlAxis} aria-hidden="true">
      {ticks.map((t) => (
        <span key={t} className={`${styles.tlTick} ${styles.tlPos}`} style={at(t, span)}>
          {label(t)}
        </span>
      ))}
    </div>
  )
}

/** The dashed line through the dots of the milestone being followed, from the top path down. */
export function Connector({
  rows,
  layouts,
  follow,
  span,
}: {
  rows: MilestoneRow[]
  layouts: RowLayout[]
  follow: number | null
  span: number
}) {
  if (follow === null) return null
  const points = layouts.flatMap((layout, i) => {
    const cluster = layout.clusters.find((c) => c.indices.includes(follow))
    return cluster ? [`${(cluster.years / span) * 1000},${i * ROW_HEIGHT + DOT_Y}`] : []
  })
  if (points.length < 2) return null
  return (
    <svg
      className={styles.tlConnector}
      style={{ height: rows.length * ROW_HEIGHT }}
      viewBox={`0 0 1000 ${rows.length * ROW_HEIGHT}`}
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <polyline points={points.join(' ')} />
    </svg>
  )
}

export function FollowChips({
  milestones,
  bare,
  hidden,
  follow,
  onFollow,
}: {
  milestones: Milestone[]
  bare: string[]
  hidden: (i: number) => boolean
  follow: number | null
  onFollow: (i: number | null) => void
}) {
  return (
    <div className={styles.matrixTools} role="group" aria-label="Follow one milestone across the paths">
      <span className={styles.tlFollow}>Follow</span>
      {milestones.map((m, i) =>
        hidden(i) ? null : (
          <button
            key={m.amountCents}
            type="button"
            className={styles.matrixToggle}
            aria-pressed={follow === i}
            onClick={() => onFollow(follow === i ? null : i)}
          >
            {bare[i]}
          </button>
        ),
      )}
      {follow !== null ? (
        <button type="button" className={styles.matrixToggle} onClick={() => onFollow(null)}>
          Clear
        </button>
      ) : null}
    </div>
  )
}

export function Legend({ rows, layouts }: { rows: MilestoneRow[]; layouts: RowLayout[] }) {
  const gutter = Math.max(0, ...layouts.map((l) => l.gutter.length))
  const beyond = Math.max(0, ...layouts.map((l) => l.beyond.length))
  return (
    <ul className={styles.matrixLegend}>
      {gutter > 0 ? (
        <li>
          <span aria-hidden="true">✓ {gutter}</span> milestones already there: reached by a check-in, or met by the path
          before today
        </li>
      ) : null}
      {beyond > 0 ? (
        <li>
          <span aria-hidden="true">→ {beyond}</span> milestones not within the path&apos;s horizon
        </li>
      ) : null}
      <li>
        <span className={`${styles.matrixKey} ${styles.matrixKeyBeyond}`} aria-hidden="true" />A shorter horizon ends in
        hatching
      </li>
      <li>A number in a dot: milestones that fall in the same year</li>
      {rows.some((r) => r.kind === 'draft') ? <li>Dashed ring: the path you are editing</li> : null}
    </ul>
  )
}
