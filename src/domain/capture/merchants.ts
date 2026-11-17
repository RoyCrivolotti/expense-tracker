import { merchantKey } from './review'
import { readSlots } from './slots'
import { cleanText } from './text'

/** The longest key a merchant is remembered under. A longer one is a sentence, not a name, and is not learned. */
export const MAX_MERCHANT_KEY = 80

/** The longest description a merchant row keeps, as the table's check allows. */
export const MAX_MERCHANT_DESCRIPTION = 200

/** `amount_cents` of the row that counts every payment to a merchant, whatever its price. */
export const ANY_AMOUNT = -1

/** Merchant rows one person may hold. At the cap the least recently seen make room. */
export const MAX_CAPTURE_MERCHANTS = 2000

/**
 * The key a recommendation's merchant is remembered under, or null when its text is not a merchant. The text is the
 * merchant once the template knows where the merchant sits, and the push's whole body until then. A whole body always
 * shows the amount with its currency marker, and a merchant never does, so text that shows one is not learned: the
 * memory never holds a push's wording, only names. A body whose amount sat in the title shows none and is learned, and
 * is then little more than the merchant. The key is the merchant folded the way the phone's own history folds it
 * (`merchantKey`), and must be 1 to `MAX_MERCHANT_KEY` characters.
 */
export function merchantKeyOf(merchantRaw: string | null): string | null {
  if (merchantRaw === null) return null
  const text = cleanText(merchantRaw)
  if (readSlots(text).some((s) => s.kind === 'number' && s.currency !== null)) return null
  const key = merchantKey(text)
  return key.length >= 1 && key.length <= MAX_MERCHANT_KEY ? key : null
}

/** What the person saved for a merchant, one vote for that description at that price and one at any price. */
export interface MerchantVote {
  key: string
  /** The saved row's cents without its sign, or `ANY_AMOUNT`. */
  amountCents: number
  /** As the person typed it, trimmed. */
  description: string
  categoryId: number | null
  type: string
  accountId: number
}

/** The part of a saved row a merchant learns from. */
export interface SavedForMerchant {
  amountCents: number
  type: string
  accountId: number
  description: string
  categoryId: number | null
}

/**
 * The votes an accept casts for the recommendation's merchant: one on the row for any price, and one on the row for
 * the saved price, so a merchant whose one name stands for several fixed prices can tell them apart. None when the
 * text is not a merchant (`merchantKeyOf`) or the description is empty or longer than the table keeps.
 */
export function merchantVotes(merchantRaw: string | null, saved: SavedForMerchant): MerchantVote[] {
  const key = merchantKeyOf(merchantRaw)
  const description = saved.description.trim()
  if (key === null || description === '' || description.length > MAX_MERCHANT_DESCRIPTION) return []
  const vote = (amountCents: number): MerchantVote => ({
    key,
    amountCents,
    description,
    categoryId: saved.categoryId,
    type: saved.type,
    accountId: saved.accountId,
  })
  const cents = Math.abs(saved.amountCents)
  return cents > 0 ? [vote(ANY_AMOUNT), vote(cents)] : [vote(ANY_AMOUNT)]
}
