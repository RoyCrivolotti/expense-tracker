import { useRef, useState } from 'react'
import type { Milestone } from '../../../../types'
import { useElementWidth } from '../../../hooks/useElementWidth'
import { useMediaQuery } from '../../../hooks/useMediaQuery'
import { useMoneyFormat } from '../../../hooks/moneyFormatContext'
import { MilestoneReadout } from './MilestoneReadout'
import type { MilestoneRow } from './milestoneModel'
import { axisSpan, axisStartYear, axisTicks, layoutRow } from './timelineModel'
import { at, timelineFrame } from './timelineFrame'
import { TimelineRow } from './MilestoneTimelineRow'
import { Axis, Connector, FollowChips, Legend, Names } from './MilestoneTimelineParts'
import styles from '../goals.module.css'

interface MilestoneTimelineProps {
  rows: MilestoneRow[]
  milestones: Milestone[]
  reached: Map<number, string>
  /** Today's date, where the axis starts. */
  today: string
}

/**
 * The same paths as the table, on one axis of years from today: a row for each path and a dot for
 * each milestone at the year from now the path reaches it. Positions are fractions of the axis, set in CSS, so
 * nothing is measured but the width the labels have to fit in.
 */
export function MilestoneTimeline({ rows, milestones, reached, today }: MilestoneTimelineProps) {
  const format = useMoneyFormat()
  const touch = useMediaQuery('(hover: none)')
  const tracks = useRef<HTMLDivElement>(null)
  const width = useElementWidth(tracks, 800)
  const [follow, setFollow] = useState<number | null>(null)
  const [text, setText] = useState<string | null>(null)

  const startYear = axisStartYear(today)
  const span = axisSpan(rows)
  const layouts = rows.map((row) => layoutRow(row, milestones, reached))
  const frame = timelineFrame({ milestones, reached, startYear, span, width, follow, format, onRead: setText })
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
            <span
              key={t}
              className={`${styles.tlGrid} ${styles.tlPos} ${t === 0 ? styles.tlGridZero : ''}`}
              style={at(t, span)}
              aria-hidden="true"
            />
          ))}
          {rows.map((row, i) => (
            <TimelineRow
              key={row.id}
              row={row}
              layout={layouts[i] ?? { gutter: [], beyond: [], clusters: [] }}
              frame={frame}
            />
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
