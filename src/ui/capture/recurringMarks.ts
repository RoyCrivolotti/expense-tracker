import type { RecommendationInfo } from '../../data/recommendationsApi'
import { buildMerchantIndex } from '../../domain/capture/review'
import type { AwaitedCharge } from '../../domain/capture/seriesLookalike'
import type { StoppedSeries } from '../../domain/engine/recurringUpcoming'
import type { TransactionSeed } from '../actions'
import type { ExpenseModel } from '../useExpenseData'
import { rememberCardOf } from './cardLinks'
import { describeRecommendation, seedOf } from './reviewFields'
import { seriesHintsOf } from './reviewSeries'

/**
 * The waiting push that is each charge the recurring card offers, as the add form opens it, keyed by series. A push
 * stands for a charge only when the series match names that one series and that usual date, the same hint the To
 * review card shows: a push two series fit stands for neither, and a series stopped on this device, or whose charge is
 * logged, is never matched. The form opens filled from the series, as the push's own Review would, so one payment has
 * one way in.
 */
export function pushesForCharges(
  charges: readonly AwaitedCharge[],
  model: ExpenseModel,
  pushes: readonly RecommendationInfo[],
  stopped: StoppedSeries,
): Map<string, TransactionSeed> {
  const merchants = buildMerchantIndex(model.dataset.transactions)
  const hints = seriesHintsOf(pushes, model, merchants, stopped)
  const byCharge = new Map<string, RecommendationInfo>()
  for (const rec of pushes) {
    const hint = hints.get(rec.id)
    if (hint && hint.kind !== 'none' && hint.kind !== 'choose') {
      byCharge.set(`${hint.series.seriesKey}|${hint.series.usualDate}`, rec)
    }
  }
  const seeds = new Map<string, TransactionSeed>()
  for (const charge of charges) {
    const rec = byCharge.get(`${charge.seriesKey}|${charge.predictedDate}`)
    if (!rec) continue
    const view = describeRecommendation(rec, model, merchants, hints.get(rec.id))
    seeds.set(charge.seriesKey, seedOf(view, rememberCardOf(view)))
  }
  return seeds
}
