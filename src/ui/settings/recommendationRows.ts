import type { RecommendationInfo } from '../../data/recommendationsApi'
import type { Transaction } from '../../types'
import type { TransactionSeed } from '../actions'

/** What the add form opens with. A field the push could not give is left out, so the form's own default stands. */
export function seedOf(rec: RecommendationInfo): TransactionSeed {
  return {
    recommendationId: rec.id,
    date: rec.localDate,
    ...(rec.amountCents !== null ? { amountCents: rec.amountCents } : {}),
    ...(rec.accountId !== null ? { accountId: rec.accountId } : {}),
    ...(rec.suggestedType ? { type: rec.suggestedType } : {}),
    ...(rec.descriptionSuggested ? { description: rec.descriptionSuggested } : {}),
  }
}

/** Why a row needs the person's eye before they submit it. Derived on read, never stored. */
export function warningsOf(rec: RecommendationInfo): string[] {
  const out: string[] = []
  if (rec.amountCents === null) out.push('Incomplete')
  if (rec.currency !== null && rec.currency !== 'EUR') out.push(`In ${rec.currency}`)
  if (rec.suggestedType === null) out.push('Pick a type')
  return out
}

/**
 * The one typed row this payment probably is: same account, same amount, a day or less apart. Two or more is
 * ambiguous and gives none, so the app never picks between them.
 */
export function entryFor(rec: RecommendationInfo, transactions: readonly Transaction[]): Transaction | null {
  if (rec.amountCents === null || rec.accountId === null) return null
  const day = Date.parse(`${rec.localDate}T00:00:00Z`)
  const found = transactions.filter(
    (t) =>
      t.accountId === rec.accountId &&
      Math.abs(t.amountCents) === rec.amountCents &&
      Math.abs(Date.parse(`${t.date}T00:00:00Z`) - day) <= 86_400_000 &&
      !t.cancelled,
  )
  return found.length === 1 ? found[0]! : null
}
