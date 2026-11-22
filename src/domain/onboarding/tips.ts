/**
 * The first-visit tips a person has put away, kept with their settings (`settings.tips_seen`) so one dismissal holds on every device.
 *
 * The saved list has three states:
 *  - missing: setup never wrote one. With transactions in the account the person is established and every tip counts as seen,
 *    so nobody who was here before this existed meets a tip without asking for them. With none they are new.
 *  - an empty list: a new person, nothing seen yet. Finishing or skipping setup writes it, and so does "Show the tips again".
 *  - ids: those tips are put away.
 */

/** Longest id and longest list the server keeps: a typo or a hostile client cannot grow a settings row without bound. */
export const TIP_ID_MAX_LENGTH = 40
export const TIPS_SEEN_MAX = 100

const TIP_ID_PATTERN = /^[a-z][a-z0-9-]*$/

/** The tips that exist. Each card names its own; later ones are added here. */
export const TIP_IDS = {
  gettingStarted: 'getting-started',
  transactions: 'transactions',
  flagged: 'flagged',
  analytics: 'analytics',
  goals: 'goals',
  goalsProgress: 'goals-progress',
  /** Not a card: the gate for the lines in the transaction form, which are never put away one by one. */
  formLines: 'form-lines',
} as const

export type TipId = (typeof TIP_IDS)[keyof typeof TIP_IDS]

/** Why `value` cannot be a saved list, or null when it can. Shared by the server and the in-memory double. */
export function tipsSeenError(value: unknown): string | null {
  if (!Array.isArray(value)) return 'tipsSeen must be a list of tip ids'
  if (value.length > TIPS_SEEN_MAX) return `tipsSeen can hold at most ${TIPS_SEEN_MAX} ids`
  const bad = value.some((id) => typeof id !== 'string' || id.length > TIP_ID_MAX_LENGTH || !TIP_ID_PATTERN.test(id))
  return bad ? 'tipsSeen ids must be lowercase words joined by hyphens' : null
}

/** The list a stored value holds, or undefined for a column never written (or one that cannot be read). */
export function parseTipsSeen(raw: string | null): string[] | undefined {
  if (raw === null) return undefined
  try {
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return undefined
    return [...new Set(parsed.filter((id): id is string => typeof id === 'string'))]
  } catch {
    return undefined
  }
}

/** True when the account's own history says this person was here before tips existed. */
export function isEstablished(saved: readonly string[] | undefined, hasTransactions: boolean): boolean {
  return saved === undefined && hasTransactions
}

/** Whether `id` is put away: listed, or the person is established. A card's own data rule comes on top of this. */
export function isTipSeen(saved: readonly string[] | undefined, id: string, hasTransactions: boolean): boolean {
  return isEstablished(saved, hasTransactions) || (saved?.includes(id) ?? false)
}

/** The list to save once `id` is put away, on top of what is saved and what this visit has already put away. */
export function withTipSeen(saved: readonly string[] | undefined, extra: Iterable<string>, id: string): string[] {
  return [...new Set([...(saved ?? []), ...extra, id])]
}

/** `tipsSeen` as a settings row carries it: left out, not null, when never written, which is how a person who has not been through setup is told apart. */
export function tipsSeenField(raw: string | null | undefined): { tipsSeen?: string[] } {
  const tipsSeen = parseTipsSeen(raw ?? null)
  return tipsSeen ? { tipsSeen } : {}
}
