import type { RecommendationInfo } from '../../data/recommendationsApi'
import type { Transaction } from '../../types'
import type { TransactionSeed } from '../actions'

export function isForeign(rec: RecommendationInfo): boolean {
  return rec.currency !== null && rec.currency !== 'EUR'
}

/** The amount in its own currency code, for a push that was not in euros. Falls back to the bare code for an unknown one. */
export function foreignAmountText(rec: RecommendationInfo): string {
  const major = (rec.amountCents ?? 0) / 100
  try {
    return new Intl.NumberFormat('en-GB', { style: 'currency', currency: rec.currency ?? 'EUR' }).format(major)
  } catch {
    return `${major.toFixed(2)} ${rec.currency}`
  }
}

/** What the add form opens with. A field the push could not give is left out, so the form's own default stands. */
export function seedOf(rec: RecommendationInfo): TransactionSeed {
  return {
    recommendationId: rec.id,
    date: rec.localDate,
    // Cents in another currency are not euros, so the person types the euro amount from their bank app.
    ...(rec.amountCents !== null && !isForeign(rec) ? { amountCents: rec.amountCents } : {}),
    ...(rec.accountId !== null ? { accountId: rec.accountId } : {}),
    ...(rec.suggestedType ? { type: rec.suggestedType } : {}),
    ...(rec.descriptionSuggested ? { description: rec.descriptionSuggested } : {}),
  }
}

/** Why a row needs the person's eye before they submit it. Derived on read, never stored. */
export function warningsOf(rec: RecommendationInfo): string[] {
  const out: string[] = []
  if (rec.amountCents === null) out.push('Incomplete')
  if (isForeign(rec)) out.push(`In ${rec.currency}`)
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

/** The list's rows in runs of one local day, in the order given. */
export function groupByDay(rows: readonly RecommendationInfo[]): { date: string; rows: RecommendationInfo[] }[] {
  const days: { date: string; rows: RecommendationInfo[] }[] = []
  for (const rec of rows) {
    const last = days[days.length - 1]
    if (last?.date === rec.localDate) last.rows.push(rec)
    else days.push({ date: rec.localDate, rows: [rec] })
  }
  return days
}
