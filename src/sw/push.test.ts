import { describe, expect, it, vi } from 'vitest'
import {
  badgeOf,
  landingUrl,
  moneyText,
  notificationOf,
  openReview,
  parsePayload,
  REVIEW_CHANGED,
  showPush,
  tellWindows,
} from './push'

const SCOPE = 'https://app.example/'
const payment = {
  v: 1,
  kind: 'payment',
  id: 'rec-1',
  url: '/?review=rec-1',
  amountCents: 1250,
  currency: 'EUR',
  merchant: 'Shop Example',
  open: 3,
}

describe('reading a push', () => {
  it('reads a payment and a summary, keeping only the fields it knows', () => {
    expect(parsePayload(JSON.stringify(payment))).toEqual({
      kind: 'payment',
      id: 'rec-1',
      url: '/?review=rec-1',
      amountCents: 1250,
      currency: 'EUR',
      merchant: 'Shop Example',
      open: 3,
    })
    expect(
      parsePayload(
        JSON.stringify({ v: 1, kind: 'summary', url: '/', count: 3, totalCents: 4820, currency: 'EUR', extra: 'x' }),
      ),
    ).toEqual({ kind: 'summary', url: '/', count: 3, totalCents: 4820, currency: 'EUR', open: undefined })
    expect(parsePayload(JSON.stringify({ v: 1, kind: 'payment', id: 'r', url: '/', merchant: null }))).toMatchObject({
      merchant: null,
      amountCents: undefined,
    })
  })

  it('reads nothing from an empty push, bad JSON, another version, a missing url or an unknown kind', () => {
    for (const text of [
      null,
      'not json',
      '[]',
      '"x"',
      JSON.stringify({ v: 2, kind: 'payment', id: 'r', url: '/' }),
      JSON.stringify({ v: 1, kind: 'payment', id: 'r' }),
      JSON.stringify({ v: 1, kind: 'other', url: '/' }),
      JSON.stringify({ v: 1, kind: 'payment', url: '/' }),
    ]) {
      expect(parsePayload(text), String(text)).toBeNull()
    }
  })
})

describe('the words on the lock screen', () => {
  it('say the amount in the device’s own way and the merchant, or that the payment is new', () => {
    const shown = notificationOf(parsePayload(JSON.stringify(payment)), 'es-ES')
    expect(shown.title).toBe('Payment to review')
    expect(shown.options.body).toBe(`${moneyText(1250, 'EUR', 'es-ES')} · Shop Example`)
    expect(shown.options.body).toContain('12,50')
    expect(shown.options.tag).toBe('review-rec-1')
    expect(shown.options.data).toEqual({ url: '/?review=rec-1' })
    expect(
      notificationOf({ kind: 'payment', id: 'r', url: '/', amountCents: 400, currency: 'USD', merchant: null }, 'en-US')
        .options.body,
    ).toBe('$4.00 · New payment')
    expect(notificationOf({ kind: 'payment', id: 'r', url: '/', merchant: 'Shop' }, 'en-US').options.body).toBe('Shop')
  })

  it('say how many payments a summary holds, with the total when every one is in one currency', () => {
    expect(
      notificationOf({ kind: 'summary', url: '/', count: 3, totalCents: 4820, currency: 'EUR' }, 'en-GB'),
    ).toMatchObject({
      title: 'Payments to review',
      options: { body: '3 payments · €48.20', tag: 'review-summary', data: { url: '/' } },
    })
    expect(notificationOf({ kind: 'summary', url: '/', count: 1 }, 'en-GB').options.body).toBe('1 payment')
  })

  it('still say something for a push that could not be read, so the permission is never lost to a silent one', () => {
    expect(notificationOf(null, 'en-GB')).toMatchObject({
      title: 'Payment to review',
      options: { body: 'Tap to see it', tag: 'review', data: { url: '/' } },
    })
  })

  it('write money in the locale, and the plain figure for a currency code that is not one', () => {
    expect(moneyText(1250, 'EUR', 'de-DE')).toContain('12,50')
    expect(moneyText(1250, 'NOPE', 'en-GB')).toBe('12.50 NOPE')
  })
})

describe('showing a push', () => {
  it('shows the notification and puts the open count on the badge', async () => {
    const registration = { showNotification: vi.fn(() => Promise.resolve()) }
    const badge = vi.fn(() => Promise.resolve())
    await showPush(JSON.stringify(payment), registration, badge, 'en-GB')
    expect(registration.showNotification).toHaveBeenCalledWith(
      'Payment to review',
      expect.objectContaining({ tag: 'review-rec-1' }),
    )
    expect(badge).toHaveBeenCalledWith(3)
  })

  it('shows the generic notification for a push it cannot read, and leaves the badge alone without a count or a badge', async () => {
    const registration = { showNotification: vi.fn(() => Promise.resolve()) }
    const badge = vi.fn(() => Promise.resolve())
    await showPush('garbage', registration, badge, 'en-GB')
    expect(registration.showNotification).toHaveBeenCalledWith(
      'Payment to review',
      expect.objectContaining({ body: 'Tap to see it' }),
    )
    expect(badge).not.toHaveBeenCalled()
    await showPush(JSON.stringify(payment), registration, null, 'en-GB')
    expect(registration.showNotification).toHaveBeenCalledTimes(2)
  })

  it('does not let a badge that fails fail the notification', async () => {
    const registration = { showNotification: vi.fn(() => Promise.resolve()) }
    await expect(
      showPush(JSON.stringify(payment), registration, () => Promise.reject(new Error('no badge')), 'en-GB'),
    ).resolves.toBeUndefined()
  })
})

describe('telling open windows', () => {
  const windows = () => [{ postMessage: vi.fn() }, { postMessage: vi.fn() }]

  it('sends every open window one message after the notification is shown', async () => {
    const open = windows()
    const clients = { matchAll: vi.fn(() => Promise.resolve(open)) }
    const order: string[] = []
    const registration = { showNotification: vi.fn(() => (order.push('shown'), Promise.resolve())) }
    open[0]?.postMessage.mockImplementation(() => order.push('told'))

    await showPush(JSON.stringify(payment), registration, null, 'en-GB', clients)

    expect(clients.matchAll).toHaveBeenCalledWith({ type: 'window', includeUncontrolled: true })
    for (const w of open) expect(w.postMessage).toHaveBeenCalledExactlyOnceWith({ type: REVIEW_CHANGED })
    expect(order).toEqual(['shown', 'told'])
  })

  it('sets the badge before it reaches for the windows, so a slow list of them cannot delay it', async () => {
    const order: string[] = []
    const registration = { showNotification: vi.fn(() => Promise.resolve()) }
    const badge = vi.fn(() => (order.push('badge'), Promise.resolve()))
    const clients = { matchAll: vi.fn(() => (order.push('windows'), Promise.resolve([]))) }

    await showPush(JSON.stringify(payment), registration, badge, 'en-GB', clients)

    expect(order).toEqual(['badge', 'windows'])
  })

  it('tells them for a push it cannot read too, since the list may have changed', async () => {
    const open = windows()
    await showPush('garbage', { showNotification: vi.fn(() => Promise.resolve()) }, null, 'en-GB', {
      matchAll: () => Promise.resolve(open),
    })
    expect(open[0]?.postMessage).toHaveBeenCalledOnce()
  })

  it('never fails the push when the windows cannot be listed', async () => {
    const registration = { showNotification: vi.fn(() => Promise.resolve()) }
    const badge = vi.fn(() => Promise.resolve())
    await expect(tellWindows({ matchAll: () => Promise.reject(new Error('gone')) })).resolves.toBeUndefined()
    await showPush(JSON.stringify(payment), registration, badge, 'en-GB', {
      matchAll: () => Promise.reject(new Error('gone')),
    })
    expect(badge).toHaveBeenCalledWith(3)
  })
})

describe('where a tap lands', () => {
  it('is the notification’s URL inside the app, never another origin', () => {
    expect(landingUrl({ url: '/?review=rec-1' }, SCOPE)).toBe('https://app.example/?review=rec-1')
    expect(landingUrl({ url: 'https://evil.example/' }, SCOPE)).toBe(SCOPE)
    expect(landingUrl({ url: '//evil.example/x' }, SCOPE)).toBe(SCOPE)
    expect(landingUrl(undefined, SCOPE)).toBe(SCOPE)
    expect(landingUrl({ url: 'http://[bad' }, SCOPE)).toBe(SCOPE)
  })

  it('brings an open window of the app forward and sends it to the payment', async () => {
    const window = {
      url: 'https://app.example/',
      focus: vi.fn(() => Promise.resolve()),
      navigate: vi.fn(() => Promise.resolve()),
    }
    const other = { url: 'https://other.example/', focus: vi.fn(), navigate: vi.fn() }
    const clients = {
      matchAll: vi.fn(() => Promise.resolve([other, window])),
      openWindow: vi.fn(() => Promise.resolve()),
    }
    await openReview('https://app.example/?review=rec-1', clients)
    expect(window.focus).toHaveBeenCalled()
    expect(window.navigate).toHaveBeenCalledWith('https://app.example/?review=rec-1')
    expect(other.navigate).not.toHaveBeenCalled()
    expect(clients.openWindow).not.toHaveBeenCalled()
  })

  it('opens a window when none is open, or when the open one cannot be sent there', async () => {
    const clients = { matchAll: vi.fn(() => Promise.resolve([])), openWindow: vi.fn(() => Promise.resolve()) }
    await openReview('https://app.example/?review=rec-1', clients)
    expect(clients.openWindow).toHaveBeenCalledWith('https://app.example/?review=rec-1')
    const stuck = {
      url: 'https://app.example/',
      focus: vi.fn(() => Promise.reject(new Error('no'))),
      navigate: vi.fn(() => Promise.reject(new Error('no'))),
    }
    const clients2 = { matchAll: vi.fn(() => Promise.resolve([stuck])), openWindow: vi.fn(() => Promise.resolve()) }
    await openReview('https://app.example/?review=rec-1', clients2)
    expect(clients2.openWindow).toHaveBeenCalledWith('https://app.example/?review=rec-1')
  })
})

describe('the badge', () => {
  it('is the navigator’s setter where there is one, bound to it, and nothing elsewhere', async () => {
    const calls: number[] = []
    const nav = {
      setAppBadge(count: number) {
        calls.push(count)
        return Promise.resolve()
      },
    }
    await badgeOf(nav)?.(2)
    expect(calls).toEqual([2])
    expect(badgeOf({})).toBeNull()
    expect(badgeOf(undefined)).toBeNull()
  })
})
