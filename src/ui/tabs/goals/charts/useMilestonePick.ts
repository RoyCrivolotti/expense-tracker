import { useMemo, useState } from 'react'
import type { GoalScenario, Milestone } from '../../../../types'
import type { NewGoalScenario } from '../../../../data/dataSource'
import type { MoneyFormat } from '../../../../engine'
import { useMoneyFormat } from '../../../hooks/moneyFormatContext'
import { todayIso } from '../../../components/transactionFormState'
import { useShowMilestones } from './useShowMilestones'
import { endNoteFor, pickCrossings, type PickLine } from './milestonePick'
import { referenceLines, type ReferenceLines } from './referenceLines'
import type { ScenarioLine } from './heroLegendState'

interface MilestonePickInput {
  isHero: boolean
  milestones: Milestone[]
  drawnMax: number | undefined
  fiTargetCents: number | null
  nominalMode: boolean
  years: number[]
  inflationRate: number
  lines: ScenarioLine[]
  scenarios: GoalScenario[]
  draft: NewGoalScenario
  /** The axis' first day, which dates its years. */
  origin: string | null
}

/**
 * Milestones and the FI target as reference lines, in both views (see `referenceLines`): a milestone
 * is an amount on the account and the FI target is in the plan's money, so each is flat in one view
 * and moves with the inflation in the other. A target far above the plan is left off, and reported,
 * rather than drawn: a reference line sets the axis, so a 25M target over a plan that reaches 8M would
 * leave the lines in the bottom third of the chart. That holds in every window, All included.
 *
 * On the hero chart one milestone can be picked. Its line is drawn bright, a dot marks where each path
 * reaches it and a note ends the line; the rows say when. Nothing is labelled until one is picked.
 */
export function useMilestonePick(input: MilestonePickInput) {
  const { isHero, milestones, drawnMax, fiTargetCents, nominalMode, years, inflationRate } = input
  const format = useMoneyFormat()
  const [pickedAmount, setPicked] = useState<number | null>(null)
  const [shown, setShown] = useShowMilestones()
  const amounts = useMemo(() => [...new Set(milestones.map((m) => m.amountCents))].sort((a, b) => a - b), [milestones])
  // The picker is the hero chart's alone, and offers no chips while the lines are off.
  const offered = useMemo(() => (isHero && shown ? amounts : []), [isHero, shown, amounts])
  const drawn = useMemo(() => (shown ? milestones : []), [shown, milestones])
  // Only the hero chart offers the picker, and a milestone that has since been removed is no longer picked.
  const picked = pickedAmount !== null && offered.includes(pickedAmount) ? pickedAmount : null
  const refs = useMemo(
    () =>
      referenceLines({
        milestones: drawn,
        drawnMax,
        fiTargetCents,
        nominalMode,
        years,
        inflationRate,
        pickedCents: picked,
      }),
    [drawn, drawnMax, fiTargetCents, nominalMode, years, inflationRate, picked],
  )
  const { pick, annotations } = usePickMarks(input, picked, refs.highlight, format)
  // Turning the lines off takes a pick with them.
  const setShownAndClear = (next: boolean) => {
    setShown(next)
    if (!next) setPicked(null)
  }
  return {
    ...refs,
    amounts: offered,
    available: isHero && amounts.length > 0,
    shown,
    setShown: setShownAndClear,
    picked,
    setPicked,
    rows: pick?.rows ?? [],
    pick,
    annotations,
  }
}

/** Where each path reaches the picked milestone, and the marks drawn for it while its line is drawn. */
function usePickMarks(
  { lines, scenarios, draft, inflationRate, nominalMode, years, origin }: MilestonePickInput,
  picked: number | null,
  highlight: ReferenceLines['highlight'],
  format: MoneyFormat,
) {
  const pick = useMemo(
    () =>
      picked === null
        ? null
        : pickCrossings({
            lines: pickLinesOf(lines, scenarios, draft),
            amountCents: picked,
            inflationRate,
            nominalMode,
            years,
            today: todayIso(),
          }),
    [picked, lines, scenarios, draft, inflationRate, nominalMode, years],
  )
  // Marks only on a picked line that is drawn: dots where each path reaches it, and a note at its right end.
  const annotations = useMemo(
    () =>
      pick && highlight && picked !== null
        ? {
            dots: pick.dots,
            endNote: endNoteFor({
              amountCents: picked,
              inflationRate,
              nominalMode,
              years,
              planStartDate: origin,
              format,
            }),
          }
        : undefined,
    [pick, highlight, picked, inflationRate, nominalMode, years, origin, format],
  )
  return { pick, annotations }
}

/** The paths as the milestone picker needs them: each with the date its plan starts on. */
function pickLinesOf(
  lines: ScenarioLine[],
  scenarios: GoalScenario[],
  draft: NewGoalScenario,
): PickLine[] {
  return lines.map((l) => ({
    id: l.id,
    name: l.name,
    color: l.color,
    params: l.params,
    offsetYears: l.offsetYears,
    planStartDate:
      (l.scenarioId === null ? draft.planStartDate : scenarios.find((s) => s.id === l.scenarioId)?.planStartDate) ??
      null,
  }))
}
