import { Fragment, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import type { Milestone } from '../../../../types'
import { milestoneLabelWithAmount, shortMonthYearLabel } from '../../../../engine'
import { useElementWidth } from '../../../hooks/useElementWidth'
import { useMediaQuery } from '../../../hooks/useMediaQuery'
import { useMoneyFormat } from '../../../hooks/moneyFormatContext'
import { formatMoneyShort } from '../chartTheme'
import { scenarioInk } from '../scenarioInk'
import { MilestoneReadout } from './MilestoneReadout'
import { describeCell, type MilestoneRow } from './milestoneModel'
import {
  DOT_Y,
  GUTTER,
  ROW_HEIGHT,
  axisSpan,
  axisStartYear,
  axisTicks,
  describeBeyond,
  describeCluster,
  describeGutter,
  layoutRow,
  placeLabels,
  rangeLabel,
  rowOffset,
  type DotCluster,
  type RowLayout,
} from './timelineModel'
import styles from '../goals.module.css'

/** What every row of the timeline draws against. */
interface Frame {
  milestones: Milestone[]
  reached: Map<number, string>
  /** The calendar year the axis starts in, which is today's. */
  startYear: number
  span: number
  /** The width in pixels the axis takes, which decides how many labels fit. */
  track: number
  /** The milestone being followed, or null. */
  follow: number | null
  /** Each milestone as prose ("House deposit (100k €)") and as a short amount ("100k"). */
  full: string[]
  bare: string[]
  onRead: (text: string) => void
}

const at = (t: number, span: number): CSSProperties => ({ '--t': t / span }) as CSSProperties

function clusterSentence(row: MilestoneRow, cluster: DotCluster, frame: Frame): string {
  const first = cluster.indices[0] ?? 0
  if (cluster.indices.length === 1) {
    return describeCell({
      row,
      index: first,
      amount: frame.full[first] ?? '',
      reachedOn: frame.reached.get(frame.milestones[first]?.amountCents ?? 0),
      plan: null,
    })
  }
  return describeCluster(row, cluster, cluster.indices.map((i) => frame.full[i] ?? ''))
}

function Reading({
  text,
  frame,
  className,
  style,
  children,
}: {
  text: string
  frame: Frame
  className: string
  style?: CSSProperties
  children?: ReactNode
}) {
  return (
    <button
      type="button"
      className={className}
      style={style}
      aria-label={text}
      onClick={() => frame.onRead(text)}
      onFocus={() => frame.onRead(text)}
      onMouseEnter={() => frame.onRead(text)}
    >
      {children}
    </button>
  )
}

function dotClass(row: MilestoneRow, cluster: DotCluster, picked: boolean): string {
  const classes = [styles.tlDot]
  if (cluster.indices.length > 1) classes.push(styles.tlDotMulti)
  if (row.kind === 'draft') classes.push(styles.tlDotDraft)
  if (picked) classes.push(styles.tlDotPick)
  return classes.join(' ')
}

function Dots({ row, layout, frame }: { row: MilestoneRow; layout: RowLayout; frame: Frame }) {
  const picks = layout.clusters.map((c) => frame.follow !== null && c.indices.includes(frame.follow))
  const texts = layout.clusters.map((c, i) => (picks[i] ? `${c.years}y` : rangeLabel(c.indices.map((j) => frame.bare[j] ?? ''))))
  const levels = placeLabels(
    layout.clusters.map((c, i) => ({ at: c.years, text: texts[i] ?? '', pick: picks[i] === true })),
    frame.span,
    frame.track,
  )
  return (
    <>
      {layout.clusters.map((c, i) => (
        <Fragment key={c.years}>
          <Reading
            text={clusterSentence(row, c, frame)}
            frame={frame}
            className={`${dotClass(row, c, picks[i] === true)} ${styles.tlPos}`}
            style={at(c.years, frame.span)}
          >
            {c.indices.length > 1 ? <span aria-hidden="true">{c.indices.length}</span> : null}
          </Reading>
          {levels[i] ? (
            <span
              className={`${styles.tlLabel} ${styles.tlPos} ${levels[i] === 'up' ? styles.tlLabelUp : styles.tlLabelDown} ${picks[i] ? styles.tlLabelPick : ''}`}
              style={at(c.years, frame.span)}
              aria-hidden="true"
            >
              {texts[i]}
            </span>
          ) : null}
        </Fragment>
      ))}
    </>
  )
}

function Badges({ row, layout, end, frame }: { row: MilestoneRow; layout: RowLayout; end: number; frame: Frame }) {
  const amounts = (indices: number[]) => indices.map((i) => frame.full[i] ?? '')
  const how = layout.gutter.map((i) => {
    const on = frame.reached.get(frame.milestones[i]?.amountCents ?? 0)
    if (on) return `reached by ${shortMonthYearLabel(on)}`
    return row.sinceStart[i] === 0 ? 'met at its start' : 'reached before today'
  })
  return (
    <>
      {layout.gutter.length > 0 ? (
        <Reading text={describeGutter(row, amounts(layout.gutter), how)} frame={frame} className={`${styles.tlBadge} ${styles.tlBadgeLeft}`}>
          <span aria-hidden="true">✓ {layout.gutter.length}</span>
        </Reading>
      ) : null}
      {layout.beyond.length > 0 ? (
        <span className={styles.tlPos} style={at(end, frame.span)}>
          <Reading text={describeBeyond(row, amounts(layout.beyond))} frame={frame} className={`${styles.tlBadge} ${styles.tlBadgeRight}`}>
            <span aria-hidden="true">→ {layout.beyond.length}</span>
          </Reading>
        </span>
      ) : null}
    </>
  )
}

function PathBar({ row, offset, end, span }: { row: MilestoneRow; offset: number; end: number; span: number }) {
  return (
    <>
      <span
        className={row.kind === 'draft' ? `${styles.tlLine} ${styles.tlLineDraft}` : styles.tlLine}
        style={{ '--from': offset / span, '--to': end / span } as CSSProperties}
      />
      {end < span ? <span className={styles.tlHatch} style={{ '--to': end / span } as CSSProperties} /> : null}
      <span className={`${styles.tlCap} ${styles.tlPos}`} style={at(end, span)} />
    </>
  )
}

function TimelineRow({ row, layout, frame }: { row: MilestoneRow; layout: RowLayout; frame: Frame }) {
  return (
    <div className={styles.tlRow} style={{ '--rc': scenarioInk(row.color) } as CSSProperties}>
      <PathBar row={row} offset={rowOffset(row)} end={row.horizonFromNow} span={frame.span} />
      <Badges row={row} layout={layout} end={row.horizonFromNow} frame={frame} />
      <Dots row={row} layout={layout} frame={frame} />
    </div>
  )
}

function Names({ rows }: { rows: MilestoneRow[] }) {
  return (
    <div className={styles.tlNames}>
      {rows.map((row) => (
        <div key={row.id} className={row.kind === 'fromToday' ? `${styles.tlName} ${styles.matrixFromToday}` : styles.tlName} title={row.name}>
          <span className={styles.milestoneScenarioNameRow}>
            <span className={styles.swatch} style={{ background: scenarioInk(row.color) }} />
            <span className={styles.milestoneScenarioName}>{row.name}</span>
          </span>
        </div>
      ))}
    </div>
  )
}

function Axis({ ticks, span, label, bottom }: { ticks: number[]; span: number; label: (t: number) => string; bottom?: boolean }) {
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
function Connector({ rows, layouts, follow, span }: { rows: MilestoneRow[]; layouts: RowLayout[]; follow: number | null; span: number }) {
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

function FollowChips({
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

function Legend({ rows, layouts }: { rows: MilestoneRow[]; layouts: RowLayout[] }) {
  const gutter = Math.max(0, ...layouts.map((l) => l.gutter.length))
  const beyond = Math.max(0, ...layouts.map((l) => l.beyond.length))
  return (
    <ul className={styles.matrixLegend}>
      {gutter > 0 ? (
        <li>
          <span aria-hidden="true">✓ {gutter}</span> milestones already there: reached by a check-in, or met by the path before today
        </li>
      ) : null}
      {beyond > 0 ? (
        <li>
          <span aria-hidden="true">→ {beyond}</span> milestones not within the path&apos;s horizon
        </li>
      ) : null}
      <li>
        <span className={`${styles.matrixKey} ${styles.matrixKeyBeyond}`} aria-hidden="true" />A shorter horizon ends in hatching
      </li>
      <li>A number in a dot: milestones that fall in the same year</li>
      {rows.some((r) => r.kind === 'draft') ? <li>Dashed ring: the path you are editing</li> : null}
    </ul>
  )
}

/**
 * The same paths as the table, on one axis of years from today: a row for each path and a dot for
 * each milestone at the year from now the path reaches it. Positions are fractions of the axis, set in CSS, so
 * nothing is measured but the width the labels have to fit in.
 */
export function MilestoneTimeline({
  rows,
  milestones,
  reached,
  today,
}: {
  rows: MilestoneRow[]
  milestones: Milestone[]
  reached: Map<number, string>
  /** Today's date, where the axis starts. */
  today: string
}) {
  const format = useMoneyFormat()
  const touch = useMediaQuery('(hover: none)')
  const tracks = useRef<HTMLDivElement>(null)
  const width = useElementWidth(tracks, 800)
  const [follow, setFollow] = useState<number | null>(null)
  const [text, setText] = useState<string | null>(null)

  const startYear = axisStartYear(today)
  const span = axisSpan(rows)
  const layouts = rows.map((row) => layoutRow(row, milestones, reached))
  const frame: Frame = {
    milestones,
    reached,
    startYear,
    span,
    track: Math.max(0, width - 2 * GUTTER),
    follow,
    full: milestones.map((m) => milestoneLabelWithAmount(m, (cents) => formatMoneyShort(cents, format))),
    bare: milestones.map((m) => formatMoneyShort(m.amountCents, { ...format, symbol: '' }).trim()),
    onRead: setText,
  }
  const allReached = milestones.every((m) => reached.has(m.amountCents))
  const ticks = axisTicks(span)

  return (
    <div className={follow === null ? styles.tl : `${styles.tl} ${styles.tlDim}`}>
      <FollowChips
        milestones={milestones}
        bare={frame.bare}
        hidden={(i) => !allReached && reached.has(milestones[i]?.amountCents ?? 0)}
        follow={follow}
        onFollow={setFollow}
      />
      <div className={styles.tlBody}>
        <Names rows={rows} />
        <div ref={tracks} className={styles.tlTracks}>
          <Axis ticks={ticks} span={span} label={(t) => (t === 0 ? 'now' : `${t}y`)} />
          {ticks.map((t) => (
            <span key={t} className={`${styles.tlGrid} ${styles.tlPos} ${t === 0 ? styles.tlGridZero : ''}`} style={at(t, span)} aria-hidden="true" />
          ))}
          {rows.map((row, i) => (
            <TimelineRow key={row.id} row={row} layout={layouts[i] ?? { gutter: [], beyond: [], clusters: [] }} frame={frame} />
          ))}
          <Axis ticks={ticks} span={span} label={(t) => String(startYear + t)} bottom />
          <Connector rows={rows} layouts={layouts} follow={follow} span={span} />
        </div>
      </div>
      <Legend rows={rows} layouts={layouts} />
      <MilestoneReadout text={text} touch={touch} what="a dot or a badge" />
    </div>
  )
}
