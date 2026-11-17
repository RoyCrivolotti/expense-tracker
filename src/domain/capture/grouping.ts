/**
 * One movement often arrives as several pushes: a card payment and the balance alert of the same amount from the same
 * bank app seconds later, or a purchase and the instalment offer that follows it. They should make one recommendation,
 * not one each. The rule needs no word of any language: the same amount in the same currency, close in time, from
 * different wordings. It does not ask which bank app a push came from, so two apps reporting one payment join too, and so
 * would two shops charging the same price within the window.
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
  currency: string | null
  /** The moment the push says it happened, in milliseconds since the epoch. */
  occurredAtMs: number
  /** The person's template the push belongs to, or null when it has none. */
  templateId: string | null
  /** The hash of the push's source and masked words (`shapeId`). */
  shapeId: string | null
}

const sameWording = (a: GroupablePush, b: GroupablePush) =>
  (a.templateId !== null && a.templateId === b.templateId) || (a.shapeId !== null && a.shapeId === b.shapeId)

/**
 * Whether two pushes of one person describe one movement: the same absolute amount and currency, at most
 * `GROUP_WINDOW_MS` apart, and different wordings. The wording is the template, and the shape too, so two pushes of
 * one new wording that arrive together, before either has made the template the other would join, stay two.
 */
export function sameMovement(a: GroupablePush, b: GroupablePush): boolean {
  if (a.amountCents === null || b.amountCents === null) return false
  if (Math.abs(a.amountCents) !== Math.abs(b.amountCents) || a.currency !== b.currency) return false
  if (Math.abs(a.occurredAtMs - b.occurredAtMs) > GROUP_WINDOW_MS) return false
  return !sameWording(a, b)
}
