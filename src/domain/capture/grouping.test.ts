import { describe, expect, it } from 'vitest'
import { GROUP_WINDOW_MS, sameMovement } from './grouping'
import type { GroupablePush } from './grouping'

const AT = Date.parse('2026-11-03T08:41:07.000Z')
const payment: GroupablePush = { amountCents: 1050, currency: 'EUR', occurredAtMs: AT, templateId: 't-payment', shapeId: 's-payment' }
const alert: GroupablePush = { amountCents: 1050, currency: 'EUR', occurredAtMs: AT + 5_000, templateId: 't-alert', shapeId: 's-alert' }

describe('sameMovement', () => {
  it('joins a payment and the balance alert of the same amount seconds later', () => {
    expect(sameMovement(payment, alert)).toBe(true)
    expect(sameMovement(alert, payment)).toBe(true)
  })

  it('compares the amount without its sign', () => {
    expect(sameMovement(payment, { ...alert, amountCents: -1050 })).toBe(true)
  })

  it('keeps apart two pushes of one template, however close', () => {
    expect(sameMovement(payment, { ...payment, occurredAtMs: AT + 1_000, shapeId: 's-other-merchant' })).toBe(false)
  })

  it('keeps apart two pushes of one shape whose templates differ, as two pushes of a new wording arriving together', () => {
    expect(sameMovement(payment, { ...alert, shapeId: payment.shapeId })).toBe(false)
  })

  it('joins pushes when either has no template, as long as the shapes differ', () => {
    expect(sameMovement({ ...payment, templateId: null }, alert)).toBe(true)
    expect(sameMovement({ ...payment, templateId: null }, { ...alert, templateId: null })).toBe(true)
    expect(sameMovement({ ...payment, templateId: null, shapeId: null }, { ...alert, templateId: null, shapeId: null })).toBe(true)
  })

  it('reaches exactly the window, and not a millisecond past it', () => {
    expect(GROUP_WINDOW_MS).toBe(2 * 60_000)
    expect(sameMovement(payment, { ...alert, occurredAtMs: AT + GROUP_WINDOW_MS })).toBe(true)
    expect(sameMovement(payment, { ...alert, occurredAtMs: AT - GROUP_WINDOW_MS })).toBe(true)
    expect(sameMovement(payment, { ...alert, occurredAtMs: AT + GROUP_WINDOW_MS + 1 })).toBe(false)
    // Money in, then the same amount sent on six and a half minutes later: two movements.
    expect(sameMovement(payment, { ...alert, occurredAtMs: AT + 6.5 * 60_000 })).toBe(false)
  })

  it('keeps apart other amounts and other currencies', () => {
    expect(sameMovement(payment, { ...alert, amountCents: 1051 })).toBe(false)
    expect(sameMovement(payment, { ...alert, currency: 'USD' })).toBe(false)
  })

  it('never joins a push with no amount', () => {
    expect(sameMovement({ ...payment, amountCents: null }, alert)).toBe(false)
    expect(sameMovement(payment, { ...alert, amountCents: null })).toBe(false)
    expect(sameMovement({ ...payment, amountCents: null }, { ...alert, amountCents: null })).toBe(false)
  })
})
