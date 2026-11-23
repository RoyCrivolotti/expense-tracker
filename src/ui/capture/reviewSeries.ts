import type { RecommendationInfo } from '../../data/recommendationsApi'
import type { MerchantHistory, MerchantIndex } from '../../domain/capture/review'
import {
  matchPushesToSeries,
  type PushToMatch,
  type SeriesFit,
  type SeriesHint,
} from '../../domain/capture/seriesMatch'
import { cleanText, foldTitle } from '../../domain/capture/text'
import type { StoppedSeries } from '../../domain/engine/recurringUpcoming'
import type { ExpenseModel } from '../useExpenseData'
import { historyPending } from '../useHistoryWatch'
import { historyOf, knownReferences, taught } from './reviewReading'

/** The payment as the series match reads it: what the push says, and the name the person's history gives it. */
export function pushOf(
  rec: RecommendationInfo,
  model: ExpenseModel,
  merchants: MerchantIndex,
): PushToMatch {
  const bankText = rec.merchantRaw === null ? null : cleanText(rec.merchantRaw)
  const { amountCents, type, accountId } = taught(rec)
  return {
    id: rec.id,
    createdAt: rec.createdAt,
    localDate: rec.localDate,
    amountCents,
    currency: rec.currency,
    suggestedType: type,
    accountId: knownReferences(null, accountId, model).accountId,
    votedDescription: historyOf(rec, merchants, bankText).label,
  }
}

/**
 * Which monthly series each payment may be, from the same series the recurring card reminds about: the whole history's
 * when the model carries it, else the rows'. None at all while a model holding only some rows waits for its history,
 * as the recurring card offers nothing then either.
 */
export function seriesHintsOf(
  recs: readonly RecommendationInfo[],
  model: ExpenseModel,
  merchants: MerchantIndex,
  stopped: StoppedSeries,
): ReadonlyMap<string, SeriesHint> {
  if (historyPending(model)) return new Map()
  return matchPushesToSeries(
    recs.map((r) => pushOf(r, model, merchants)),
    model.dataset.transactions,
    { stopped, ...(model.history ? { groups: model.history.groups } : {}) },
  )
}

export const NO_HINT: SeriesHint = { kind: 'none' }

/**
 * The series the fields are filled from: the one a hint names, unless the person's own name for the merchant already
 * is the series' name, when the fields stay as their history has them and one tap follows the usual rule. Two series
 * fill nothing: the person picks one.
 */
function seriesToFill(
  hint: SeriesHint,
  label: string | null,
): SeriesFit | null {
  if (hint.kind === 'none' || hint.kind === 'choose') return null
  if (label !== null && foldTitle(label) === foldTitle(hint.series.description)) return null
  return hint.series
}

/** The name of the hinted series' account where the fields do not show it. */
function hintAccountOf(
  hint: SeriesHint,
  pushAccountId: number | null,
  model: ExpenseModel,
): string | null {
  if (hint.kind === 'none' || hint.kind === 'choose') return null
  if (hint.kind !== 'moved' && pushAccountId !== null) return null
  return model.lookup.account(hint.series.accountId)?.name ?? null
}

/**
 * The fields a hint changes, over what the push and the person's history give. A series fills the description,
 * category and type, and the account too when the push named none and has no card to ask about.
 */
export function seriesReading(
  hint: SeriesHint,
  history: MerchantHistory,
  pushed: ReturnType<typeof taught>,
  rec: RecommendationInfo,
  model: ExpenseModel,
) {
  const fill = seriesToFill(hint, history.label)
  const categoryId = fill ? fill.categoryId : history.categoryId
  const pushRefs = knownReferences(categoryId, pushed.accountId, model)
  const askCard = pushRefs.accountId === null && rec.card ? rec.card : null
  const refs =
    fill && pushRefs.accountId === null && !askCard ? knownReferences(categoryId, fill.accountId, model) : pushRefs
  return {
    fill,
    type: fill ? fill.type : pushed.type,
    refs,
    askCard,
    hint: hint.kind === 'none' ? null : hint,
    hintAccount: hintAccountOf(hint, pushRefs.accountId, model),
  }
}
