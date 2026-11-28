/**
 * One movement often arrives as several pushes: a card payment and the balance alert of the same amount from the same
 * bank app seconds later, or a purchase and the instalment offer that follows it. They should make one recommendation,
 * not one each. The rule needs no word of any language: the same amount in the same currency, close in time, from
 * different wordings, and the same sign written on the amount. It does not ask which bank app a push came from, so two
 * apps reporting one payment join too, and so would two shops charging the same price within the window.
 *
 * The sign is the only direction a push states by itself. Banks write a minus on money out often and a plus almost
 * never, so no sign is taken as a plus: a push with a minus never joins one without, and money sent and the same
 * amount received a minute later stay two payments. A push of a wording learned as money out but written without a
 * minus (a card payment) and a balance alert of `-10,50` for it make two recommendations, which the person sees and
 * dismisses one of; joining them would hide a payment without a word, which is the worse mistake.
 *
 * Two pushes of the same wording are always two movements, however close: two coffees of the same price a minute
 * apart are two payments. A push with no amount never groups, since there is nothing to match it on.
 *
 * The Worker decides this inside the statement that stores a push (`RECORD_EVENT_SQL`), so two pushes arriving at
 * once cannot both make a recommendation. This function is the same rule in plain code, for tests and for the reader.
 */

/**
 * How far apart two pushes of one movement may be, by the moment each says it happened. Two minutes, because in real
 * pushes every second push of one movement (a balance alert, an offer to split a purchase) came within seconds, while two
 * real movements of one amount (money in, then the same amount sent on) came minutes apart. A longer window folds those
 * into one and loses a payment without a word.
 */
export const GROUP_WINDOW_MS = 2 * 60_000

/** What grouping reads of a push. */
export interface GroupablePush {
  /** Positive cents, or null when the push showed no amount. */
  amountCents: number | null
  /**
   * Whether the bank wrote a minus on the amount: false for a plus or no sign. Null on a push stored before the sign
   * was kept, which never stops another push joining it, so groups made before stay as they were.
   */
  amountMinus: boolean | null
  currency: string | null
  /** The moment the push says it happened, in milliseconds since the epoch. */
  occurredAtMs: number
  /** The person's template the push belongs to, or null when it has none. */
  templateId: string | null
  /** The hash of the push's source and masked words (`shapeId`). */
  shapeId: string | null
}

const sameWording = (
  a: GroupablePush,
  b: GroupablePush,
) => (a.templateId !== null && a.templateId === b.templateId) || (a.shapeId !== null && a.shapeId === b.shapeId)

const oppositeSigns = (
  a: GroupablePush,
  b: GroupablePush,
) => a.amountMinus !== null && b.amountMinus !== null && a.amountMinus !== b.amountMinus

/**
 * Whether two pushes of one person describe one movement: the same amount and currency, the same sign on it, at most
 * `GROUP_WINDOW_MS` apart, and different wordings. The wording is the template, and the shape too, so two pushes of
 * one new wording that arrive together, before either has made the template the other would join, stay two. A push
 * joins a recommendation only if this holds against every push already behind it, as `RECORD_EVENT_SQL` checks.
 */
export function sameMovement(
  a: GroupablePush,
  b: GroupablePush,
): boolean {
  if (a.amountCents === null || b.amountCents === null) return false
  if (a.amountCents !== b.amountCents || a.currency !== b.currency || oppositeSigns(a, b)) return false
  if (Math.abs(a.occurredAtMs - b.occurredAtMs) > GROUP_WINDOW_MS) return false
  return !sameWording(a, b)
}
