import type { RecommendationInfo } from '../../data/recommendationsApi'
import { merchantHistory, type MerchantHistory, type MerchantIndex } from '../../domain/capture/review'
import type { ExpenseModel } from '../useExpenseData'

/** The category and account the person's own history and settings give a payment, each null unless still in use. */
export function knownReferences(
  categoryIdFromHistory: number | null,
  accountId: number | null,
  model: ExpenseModel,
) {
  const category = categoryIdFromHistory === null ? undefined : model.lookup.category(categoryIdFromHistory)
  const account = accountId === null ? undefined : model.lookup.account(accountId)
  return {
    categoryId: category?.active ? category.id : null,
    categoryName: category?.active ? category.name : null,
    accountId: account?.active ? account.id : null,
    accountName: account?.active ? account.name : null,
  }
}

/**
 * What the person's history says about the merchant. The server's suggestion when it names a description, since it
 * remembers what the person added this merchant with whatever they typed; else the rows the app holds, which match only
 * when a typed description equals the bank's text.
 */
export function historyOf(
  rec: RecommendationInfo,
  merchants: MerchantIndex,
  bankText: string | null,
): MerchantHistory {
  const s = rec.suggestion
  if (s?.description != null)
    return { sightings: s.sightings, label: s.description, categoryId: s.categoryId, settled: s.settled }
  return merchantHistory(merchants, bankText)
}

/** The amount, type and account the push's wording taught, and its flags; without a suggestion, the push's first reading. */
export function taught(rec: RecommendationInfo) {
  const s = rec.suggestion
  if (!s)
    return {
      amountCents: rec.amountCents,
      type: rec.suggestedType,
      accountId: rec.accountId,
      newShape: false,
      amountRelearned: false,
    }
  return {
    amountCents: s.amountCents,
    type: s.type,
    accountId: s.accountId,
    newShape: s.reasons.includes('new-shape'),
    amountRelearned: s.reasons.includes('amount-relearned'),
  }
}
