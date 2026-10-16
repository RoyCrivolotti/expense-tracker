import { useRef } from 'react'
import type { ListDayGroup } from '../../engine'
import { rowKey, rowShape } from '../hooks/rowHeights'
import { useFoldedSlice } from '../hooks/useFoldedSlice'
import { useWindowedList } from '../hooks/useWindowedList'
import type { RowSlice } from '../hooks/windowLayout'
import { DayGroup, type DayGroupShared } from './DayGroup'
import { ScrollAnchor } from './ScrollAnchor'
import styles from './TransactionList.module.css'

/** Stands in for the rows of a day that are not rendered. */
function Spacer({ height }: { height: number }) {
  return height > 0 ? <div aria-hidden style={{ height }} /> : null
}

interface WindowedDayGroupProps {
  group: ListDayGroup
  slice: RowSlice
  collapsed: boolean
  shared: DayGroupShared
}

function WindowedDayGroup({ group, slice, collapsed, shared }: WindowedDayGroupProps) {
  const shown = useFoldedSlice(slice, collapsed)
  return (
    <DayGroup group={group} collapsed={collapsed} {...shared}>
      <Spacer height={shown.before} />
      {group.rows.slice(shown.from, shown.to).map((row) => {
        const key = rowKey(row)
        // The wrapper is what gets measured (see windowDom.ts); a row's own root differs too much
        // from one kind to the next to measure directly.
        return (
          <div key={key} data-vrow={key} data-shape={rowShape(row)}>
            {shared.renderRow(row)}
          </div>
        )
      })}
      <Spacer height={shown.after} />
    </DayGroup>
  )
}

interface WindowedGroupsProps {
  groups: readonly ListDayGroup[]
  collapsedDates: ReadonlySet<string>
  /** Names whatever changes how tall a row is, so measurements made under another value are dropped. */
  signature: string
  shared: DayGroupShared
}

/**
 * The day groups of a list too long to render whole: those near the screen, each with only the
 * rows near the screen. Padding stands in for everything left out, so the page is as long as it
 * would be and the scroll bar and every sticky header behave as before.
 */
export function WindowedGroups({ groups, collapsedDates, signature, shared }: WindowedGroupsProps) {
  const listRef = useRef<HTMLDivElement>(null)
  const plan = useWindowedList(listRef, groups, collapsedDates, signature)
  return (
    <div
      ref={listRef}
      className={`${styles.list} ${styles.listWindowed}`}
      style={{ paddingTop: plan.top, paddingBottom: plan.bottom }}
    >
      <ScrollAnchor list={listRef} />
      {plan.groups.map(({ group, slice }) => {
        const day = groups[group]!
        return (
          <WindowedDayGroup
            key={day.date}
            group={day}
            slice={slice}
            collapsed={collapsedDates.has(day.date)}
            shared={shared}
          />
        )
      })}
    </div>
  )
}
