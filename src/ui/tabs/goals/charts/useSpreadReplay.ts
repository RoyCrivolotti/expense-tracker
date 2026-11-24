import { useMemo } from 'react'
import type { NewGoalScenario } from '../../../../data/dataSource'
import type { Milestone } from '../../../../types'
import { fireNumber, projectNetWorth, replayMarket, scenarioToParams } from '../../../../engine'
import { spreadKey } from './spreadModel'

/** The plan's own line and the market replay around it, with the FI target the replay looks for. */
export function useSpreadReplay(
  draft: NewGoalScenario,
  milestones: Milestone[],
  { inflationRate, volatility, runs }: { inflationRate: number; volatility: number; runs: number },
) {
  // The replay is the costly part, so it runs when something it reads changes, not when the draft's name does.
  const key = `${spreadKey(draft, inflationRate, volatility, runs)}|${milestones.map((m) => m.amountCents).join(',')}`
  const { plan, result, targetCents } = useMemo(() => {
    const p = scenarioToParams({ ...draft, id: 0 }, inflationRate)
    const target =
      draft.annualSpendCents > 0 && draft.safeWithdrawalRate > 0
        ? fireNumber(draft.annualSpendCents, draft.safeWithdrawalRate)
        : null
    return {
      plan: projectNetWorth(p),
      targetCents: target,
      result: replayMarket({
        params: p,
        volatility,
        runs,
        milestonesCents: milestones.map((m) => m.amountCents),
        fiTargetCents: target,
      }),
    }
    // The key is what the replay reads of the draft, the milestones and the settings.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])
  return { plan, result, targetCents }
}
