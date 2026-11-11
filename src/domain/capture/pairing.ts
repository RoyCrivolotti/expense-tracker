/** An event push or a balance alert, with the signed amount (outflows negative). */
export interface SignedMovement {
  id: string
  account: string
  signedCents: number
  atMs: number
}

/** A transfer sent (outflow) or an inflow alert, amount positive. */
export interface TransferLeg {
  id: string
  direction: 'sent' | 'inflow'
  account: string
  cents: number
  atMs: number
}

export const ALERT_WINDOW_MS = 10_000
export const TRANSFER_WINDOW_MS = 10 * 60_000

/**
 * Attaches balance alerts to the event push they describe: same account, same signed amount, within
 * the window. Signed, so an inflow never attaches to a payment. Each side is used once, nearest first.
 */
export function pairBalanceAlerts(events: readonly SignedMovement[], alerts: readonly SignedMovement[]) {
  const candidates = events.flatMap((event) =>
    alerts
      .filter((a) => a.account === event.account && a.signedCents === event.signedCents && event.signedCents !== 0)
      .map((alert) => ({ event, alert, gap: Math.abs(alert.atMs - event.atMs) }))
      .filter((c) => c.gap <= ALERT_WINDOW_MS),
  )
  candidates.sort((a, b) => a.gap - b.gap)
  const usedEvents = new Set<string>()
  const usedAlerts = new Set<string>()
  const pairs: { eventId: string; alertId: string }[] = []
  for (const { event, alert } of candidates) {
    if (usedEvents.has(event.id) || usedAlerts.has(alert.id)) continue
    usedEvents.add(event.id)
    usedAlerts.add(alert.id)
    pairs.push({ eventId: event.id, alertId: alert.id })
  }
  return {
    pairs,
    unpairedEvents: events.filter((e) => !usedEvents.has(e.id)).map((e) => e.id),
    unpairedAlerts: alerts.filter((a) => !usedAlerts.has(a.id)).map((a) => a.id),
  }
}

function couldBeOneMove(sent: TransferLeg, inflow: TransferLeg): boolean {
  return (
    sent.cents === inflow.cents &&
    sent.account !== inflow.account &&
    Math.abs(sent.atMs - inflow.atMs) <= TRANSFER_WINDOW_MS
  )
}

/**
 * Finds the two legs of a move between the user's own accounts: a transfer sent and an inflow of the
 * same amount on a different account, either one first. Two legs of the same direction never pair.
 * When a leg could go with more than one other, none is paired, since a guess would hide an event.
 */
export function matchTransferLegs(legs: readonly TransferLeg[]) {
  const sent = legs.filter((l) => l.direction === 'sent')
  const inflows = legs.filter((l) => l.direction === 'inflow')
  const sole = (others: readonly TransferLeg[], test: (o: TransferLeg) => boolean) => {
    const fits = others.filter(test)
    return fits.length === 1 ? fits[0] : undefined
  }
  const pairs: { sentId: string; inflowId: string }[] = []
  for (const s of sent) {
    const i = sole(inflows, (o) => couldBeOneMove(s, o))
    if (i && sole(sent, (o) => couldBeOneMove(o, i))?.id === s.id) {
      pairs.push({ sentId: s.id, inflowId: i.id })
    }
  }
  const paired = new Set(pairs.flatMap((p) => [p.sentId, p.inflowId]))
  return { pairs, unmatched: legs.filter((l) => !paired.has(l.id)).map((l) => l.id) }
}
