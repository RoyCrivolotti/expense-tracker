/**
 * What the service worker does with a push and with a tap on the notification it showed. Pure: the worker's own
 * objects (the registration, the clients list, the badge) are passed in, so every path runs under vitest.
 *
 * A notification is shown for every push, whatever it holds: Apple revokes the permission of a web app that receives
 * a push and shows nothing (docs/PUSH.md).
 */

export interface PaymentPayload {
  kind: 'payment'
  id: string
  url: string
  amountCents?: number | undefined
  currency?: string | undefined
  merchant?: string | null | undefined
  /** The person's open count, for the app icon's badge. */
  open?: number | undefined
}

export interface SummaryPayload {
  kind: 'summary'
  url: string
  count: number
  totalCents?: number | undefined
  currency?: string | undefined
  open?: number | undefined
}

export type PushPayload = PaymentPayload | SummaryPayload

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const optionalInt = (v: unknown): number | undefined => (typeof v === 'number' && Number.isInteger(v) ? v : undefined)
const optionalText = (v: unknown): string | undefined => (typeof v === 'string' ? v : undefined)

/** The payload the sender encrypted, or null for anything that is not one: the notification then says the least. */
export function parsePayload(text: string | null): PushPayload | null {
  if (text === null) return null
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    return null
  }
  if (!isRecord(parsed) || parsed.v !== 1 || typeof parsed.url !== 'string') return null
  const open = optionalInt(parsed.open)
  const currency = optionalText(parsed.currency)
  if (parsed.kind === 'payment' && typeof parsed.id === 'string') {
    const merchant = parsed.merchant === null ? null : optionalText(parsed.merchant)
    return {
      kind: 'payment',
      id: parsed.id,
      url: parsed.url,
      amountCents: optionalInt(parsed.amountCents),
      currency,
      merchant,
      open,
    }
  }
  if (parsed.kind === 'summary' && typeof parsed.count === 'number') {
    return {
      kind: 'summary',
      url: parsed.url,
      count: parsed.count,
      totalCents: optionalInt(parsed.totalCents),
      currency,
      open,
    }
  }
  return null
}

/** An amount in the device's own way of writing money, or the plain figure when the currency code is not one. */
export function moneyText(
  cents: number,
  currency: string,
  locale: string,
): string {
  try {
    return new Intl.NumberFormat(locale, { style: 'currency', currency }).format(cents / 100)
  } catch {
    return `${(cents / 100).toFixed(2)} ${currency}`
  }
}

export interface Shown {
  title: string
  options: NotificationOptions & { data: { url: string } }
}

const ICON = '/icons/icon-192.png'

/** The words on the lock screen. The amount and the merchant are what the bank's own push already showed there. */
export function notificationOf(
  payload: PushPayload | null,
  locale: string,
): Shown {
  if (payload === null)
    return {
      title: 'Payment to review',
      options: { body: 'Tap to see it', tag: 'review', icon: ICON, data: { url: '/' } },
    }
  if (payload.kind === 'payment') {
    const amount =
      payload.amountCents !== undefined && payload.currency
        ? moneyText(payload.amountCents, payload.currency, locale)
        : null
    const what = payload.merchant ?? 'New payment'
    const body = amount ? `${amount} · ${what}` : what
    return {
      title: 'Payment to review',
      options: { body, tag: `review-${payload.id}`, icon: ICON, data: { url: payload.url } },
    }
  }
  const total =
    payload.totalCents !== undefined && payload.currency
      ? ` · ${moneyText(payload.totalCents, payload.currency, locale)}`
      : ''
  const count = payload.count === 1 ? '1 payment' : `${payload.count} payments`
  return {
    title: 'Payments to review',
    options: { body: `${count}${total}`, tag: 'review-summary', icon: ICON, data: { url: payload.url } },
  }
}

/** The device's badge setter, where it has one: a worker's `navigator` in a browser that supports the Badging API. */
export function badgeOf(nav: unknown): ((count: number) => Promise<void>) | null {
  const setter = isRecord(nav) ? nav.setAppBadge : undefined
  return typeof setter === 'function'
    ? (count) => Promise.resolve((setter as (n: number) => unknown).call(nav, count)).then(() => undefined)
    : null
}

export interface ShowsNotifications {
  showNotification(
    title: string,
    options?: NotificationOptions,
  ): Promise<void>
}

/** What the worker tells an open window when a push arrived, so the window can read the list again (docs/PUSH.md). */
export const REVIEW_CHANGED = 'review-changed'

export interface MessagesWindows {
  matchAll(options: {
    type: 'window'
    includeUncontrolled: boolean
  }): Promise<readonly { postMessage(message: unknown): void }[]>
}

/** Tells every open window of the app that a payment to review may have arrived. Never fails the push. */
export async function tellWindows(clients: MessagesWindows): Promise<void> {
  try {
    const windows = await clients.matchAll({ type: 'window', includeUncontrolled: true })
    for (const w of windows) w.postMessage({ type: REVIEW_CHANGED })
  } catch {
    /* The notification is what matters; a window that cannot be reached reads the list when it returns. */
  }
}

/**
 * Shows the notification, puts the open count on the app icon where the device has a badge, then tells open windows.
 * The windows come last, so a slow `clients.matchAll()` never delays what the lock screen and the icon say.
 */
export async function showPush(
  text: string | null,
  registration: ShowsNotifications,
  badge: ((count: number) => Promise<void>) | null,
  locale: string,
  clients?: MessagesWindows,
): Promise<void> {
  const payload = parsePayload(text)
  const { title, options } = notificationOf(payload, locale)
  await registration.showNotification(title, options)
  if (badge && payload?.open !== undefined) await badge(payload.open).catch(() => undefined)
  if (clients) await tellWindows(clients)
}

/** Where a tap lands: the notification's URL inside the app, else the app itself. Another origin is never opened. */
export function landingUrl(
  data: unknown,
  scope: string,
): string {
  const url = isRecord(data) && typeof data.url === 'string' ? data.url : '/'
  try {
    const resolved = new URL(url, scope)
    return resolved.origin === new URL(scope).origin ? resolved.href : scope
  } catch {
    return scope
  }
}

export interface WindowLike {
  url: string
  focus(): Promise<unknown>
  navigate(url: string): Promise<unknown>
}

export interface ClientsLike {
  matchAll(options: { type: 'window'; includeUncontrolled: boolean }): Promise<readonly WindowLike[]>
  openWindow(url: string): Promise<unknown>
}

/** An open window of the app is brought forward and sent to the payment; with none, one is opened. */
export async function openReview(
  url: string,
  clients: ClientsLike,
): Promise<void> {
  const origin = new URL(url).origin
  const windows = await clients.matchAll({ type: 'window', includeUncontrolled: true })
  const open = windows.find((w) => new URL(w.url).origin === origin)
  if (!open) {
    await clients.openWindow(url)
    return
  }
  await open.focus().catch(() => undefined)
  try {
    await open.navigate(url)
  } catch {
    await clients.openWindow(url)
  }
}
