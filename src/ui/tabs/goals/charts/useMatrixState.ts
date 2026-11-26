import { useMemo, useRef, useState } from 'react'
import type { Milestone } from '../../../../types'
import { milestoneLabelWithAmount, type MoneyFormat } from '../../../../engine'
import type { CellRef, YearsUnit } from './MilestoneGrid'
import type { PhoneView } from './MilestoneMatrixParts'
import { describeCell } from './milestoneGaps'
import { goalsPerPage, reachedByEveryRow, splitPages } from './milestoneTable'
import { type MilestoneRow } from './milestoneModel'
import { formatMoneyShort } from '../chartTheme'
import { useElementWidth } from '../../../hooks/useElementWidth'
import { useMoneyFormat } from '../../../hooks/moneyFormatContext'
import { useMediaQuery } from '../../../hooks/useMediaQuery'
import { useGoalsNarrow } from '../useGoalsNarrow'

/** The width of a 375px phone's card, which is what a test (no layout) and the first paint go by. */
const PHONE_WIDTH = 327

/** Which milestones are folded into one line, which are open, and how the open ones page on the screen it is on. */
function useMatrixPages(
  rows: MilestoneRow[],
  milestones: Milestone[],
  { phone, width, page, view, goal }: { phone: boolean; width: number; page: number; view: PhoneView; goal: number },
) {
  const all = useMemo(() => milestones.map((_, i) => i), [milestones])
  const folded = useMemo(() => (phone ? reachedByEveryRow(rows, milestones.length) : []), [phone, rows, milestones])
  const open = useMemo(() => all.filter((i) => !folded.includes(i)), [all, folded])
  const pages = useMemo(() => (phone ? splitPages(open, goalsPerPage(width)) : [open]), [phone, open, width])
  const shownPage = Math.min(page, pages.length - 1)
  const columns = phone ? pages[shownPage] : undefined
  const byGoal = phone && view === 'goal'
  const goalIndex = open.includes(goal) ? goal : (open[0] ?? 0)
  return { folded, open, pages, shownPage, columns, byGoal, goalIndex }
}

/** `sentences[row][column]`: the plain sentence for each cell, against the plan while comparing with it. */
function useCellSentences(
  rows: MilestoneRow[],
  milestones: Milestone[],
  reached: Map<number, string>,
  format: MoneyFormat,
  comparing: MilestoneRow | null,
) {
  return useMemo(
    () =>
      rows.map((row) =>
        milestones.map((m, index) =>
          describeCell({
            row,
            index,
            amount: milestoneLabelWithAmount(m, (cents) => formatMoneyShort(cents, format)),
            reachedOn: reached.get(m.amountCents),
            plan: comparing,
          }),
        ),
      ),
    [rows, milestones, reached, format, comparing],
  )
}

/**
 * What the milestone table holds between renders, and what it works out from the rows for the screen it is on. The
 * box the width is measured on comes back beside the rest, for the element it lands on.
 */
export function useMatrixState(
  rows: MilestoneRow[],
  milestones: Milestone[],
  reached: Map<number, string>,
) {
  const format = useMoneyFormat()
  const [unit, setUnit] = useState<YearsUnit>('years')
  const [vsPlan, setVsPlan] = useState(false)
  const [point, setPoint] = useState<CellRef | null>(null)
  const [live, setLive] = useState(false)
  const [view, setView] = useState<PhoneView>('table')
  const [page, setPage] = useState(0)
  const [goal, setGoal] = useState(0)
  const [sheet, setSheet] = useState(false)
  // No hover on a touch screen: the cells are read by tapping them.
  const touch = useMediaQuery('(hover: none)')
  // On the phone the table shows as many milestones as its width holds, a page at a time.
  const phone = useGoalsNarrow()
  const box = useRef<HTMLDivElement>(null)
  const width = useElementWidth(box, PHONE_WIDTH)

  const plan = rows.find((r) => r.kind === 'plan') ?? null
  const comparing = vsPlan ? plan : null
  const paged = useMatrixPages(rows, milestones, { phone, width, page, view, goal })
  const amountOf = (i: number) => formatMoneyShort((milestones[i] as Milestone).amountCents, format)
  const sentences = useCellSentences(rows, milestones, reached, format, comparing)
  const state = { rows, milestones, reached, unit, setUnit, vsPlan, setVsPlan, point, setPoint, live, setLive }
  const shown = { view, setView, setPage, setGoal, sheet, setSheet, touch, phone, plan, comparing, amountOf, sentences }
  return { box, m: { ...state, ...paged, ...shown } }
}

export type MatrixState = ReturnType<typeof useMatrixState>['m']
