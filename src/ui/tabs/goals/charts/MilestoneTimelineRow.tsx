import { Fragment, type CSSProperties, type ReactNode } from 'react'
import { shortMonthYearLabel } from '../../../../engine'
import { scenarioInk } from '../scenarioInk'
import type { MilestoneRow } from './milestoneModel'
import { describeCell } from './milestoneGaps'
import {
  describeBeyond,
  describeCluster,
  describeGutter,
  placeLabels,
  rangeLabel,
  rowOffset,
  type DotCluster,
  type RowLayout,
} from './timelineModel'
import { at, type Frame } from './timelineFrame'
import styles from '../goals.module.css'

function clusterSentence(
  row: MilestoneRow,
  cluster: DotCluster,
  frame: Frame,
): string {
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
  return describeCluster(
    row,
    cluster,
    cluster.indices.map((i) => frame.full[i] ?? ''),
  )
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

function dotClass(
  row: MilestoneRow,
  cluster: DotCluster,
  picked: boolean,
): string {
  const classes = [styles.tlDot]
  if (cluster.indices.length > 1) classes.push(styles.tlDotMulti)
  if (row.kind === 'draft') classes.push(styles.tlDotDraft)
  if (picked) classes.push(styles.tlDotPick)
  return classes.join(' ')
}

function Dots({ row, layout, frame }: { row: MilestoneRow; layout: RowLayout; frame: Frame }) {
  const picks = layout.clusters.map((c) => frame.follow !== null && c.indices.includes(frame.follow))
  const texts = layout.clusters.map((c, i) =>
    picks[i] ? `${c.years}y` : rangeLabel(c.indices.map((j) => frame.bare[j] ?? '')),
  )
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
        <Reading
          text={describeGutter(row, amounts(layout.gutter), how)}
          frame={frame}
          className={`${styles.tlBadge} ${styles.tlBadgeLeft}`}
        >
          <span aria-hidden="true">✓ {layout.gutter.length}</span>
        </Reading>
      ) : null}
      {layout.beyond.length > 0 ? (
        <span className={styles.tlPos} style={at(end, frame.span)}>
          <Reading
            text={describeBeyond(row, amounts(layout.beyond))}
            frame={frame}
            className={`${styles.tlBadge} ${styles.tlBadgeRight}`}
          >
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

export function TimelineRow({ row, layout, frame }: { row: MilestoneRow; layout: RowLayout; frame: Frame }) {
  return (
    <div className={styles.tlRow} style={{ '--rc': scenarioInk(row.color) } as CSSProperties}>
      <PathBar row={row} offset={rowOffset(row)} end={row.horizonFromNow} span={frame.span} />
      <Badges row={row} layout={layout} end={row.horizonFromNow} frame={frame} />
      <Dots row={row} layout={layout} frame={frame} />
    </div>
  )
}
