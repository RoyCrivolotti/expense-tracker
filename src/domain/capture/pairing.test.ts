import { describe, expect, it } from 'vitest'
import { matchTransferLegs, pairBalanceAlerts } from './pairing'
import type { SignedMovement, TransferLeg } from './pairing'

const move = (id: string, signedCents: number, atMs: number, account = '1111'): SignedMovement => ({
  id, account, signedCents, atMs,
})
const leg = (id: string, direction: TransferLeg['direction'], cents: number, atMs: number, account: string): TransferLeg => ({
  id, direction, cents, atMs, account,
})
const SEC = 1000
const MIN = 60 * SEC

describe('pairBalanceAlerts', () => {
  it('attaches an alert to the event with the same account and signed amount within 10 seconds', () => {
    const result = pairBalanceAlerts([move('e', -1250, 0)], [move('a', -1250, 7 * SEC)])
    expect(result.pairs).toEqual([{ eventId: 'e', alertId: 'a' }])
    expect(result.unpairedAlerts).toEqual([])
  })

  it('does not attach an alert 11 seconds away', () => {
    const result = pairBalanceAlerts([move('e', -1250, 0)], [move('a', -1250, 11 * SEC)])
    expect(result.pairs).toEqual([])
    expect(result.unpairedEvents).toEqual(['e'])
    expect(result.unpairedAlerts).toEqual(['a'])
  })

  it('never attaches an inflow to a payment of the same size', () => {
    expect(pairBalanceAlerts([move('e', -1250, 0)], [move('a', 1250, SEC)]).pairs).toEqual([])
  })

  it('does not cross accounts', () => {
    expect(pairBalanceAlerts([move('e', -500, 0, '1111')], [move('a', -500, SEC, '2222')]).pairs).toEqual([])
  })

  it('uses each alert once, nearest event first', () => {
    const result = pairBalanceAlerts([move('far', -500, 0), move('near', -500, 6 * SEC)], [move('a', -500, 8 * SEC)])
    expect(result.pairs).toEqual([{ eventId: 'near', alertId: 'a' }])
    expect(result.unpairedEvents).toEqual(['far'])
  })

  it('ignores zero amounts', () => {
    expect(pairBalanceAlerts([move('e', 0, 0)], [move('a', 0, 0)]).pairs).toEqual([])
  })
})

describe('matchTransferLegs', () => {
  it('pairs a transfer sent with a later inflow of the same amount on another account', () => {
    const result = matchTransferLegs([leg('s', 'sent', 5000, 0, 'A'), leg('i', 'inflow', 5000, 3 * MIN, 'B')])
    expect(result).toEqual({ pairs: [{ sentId: 's', inflowId: 'i' }], unmatched: [] })
  })

  it('pairs when the inflow came first, 6.5 minutes earlier', () => {
    const result = matchTransferLegs([leg('i', 'inflow', 5000, 0, 'B'), leg('s', 'sent', 5000, 6.5 * MIN, 'A')])
    expect(result.pairs).toEqual([{ sentId: 's', inflowId: 'i' }])
  })

  it('does not pair across more than 10 minutes', () => {
    const result = matchTransferLegs([leg('s', 'sent', 5000, 0, 'A'), leg('i', 'inflow', 5000, 10 * MIN + 1, 'B')])
    expect(result.pairs).toEqual([])
    expect(result.unmatched).toEqual(['s', 'i'])
  })

  it('does not pair different amounts or the same account', () => {
    expect(matchTransferLegs([leg('s', 'sent', 5000, 0, 'A'), leg('i', 'inflow', 5001, 0, 'B')]).pairs).toEqual([])
    expect(matchTransferLegs([leg('s', 'sent', 5000, 0, 'A'), leg('i', 'inflow', 5000, 0, 'A')]).pairs).toEqual([])
  })

  it('never pairs two legs of the same direction', () => {
    const sentTwice = matchTransferLegs([leg('s1', 'sent', 5000, 0, 'A'), leg('s2', 'sent', 5000, MIN, 'B')])
    expect(sentTwice).toEqual({ pairs: [], unmatched: ['s1', 's2'] })
    const inflowTwice = matchTransferLegs([leg('i1', 'inflow', 900, 0, 'A'), leg('i2', 'inflow', 900, MIN, 'B')])
    expect(inflowTwice).toEqual({ pairs: [], unmatched: ['i1', 'i2'] })
  })

  it('pairs nothing when two transfers sent could both go with one inflow', () => {
    const result = matchTransferLegs([
      leg('s1', 'sent', 5000, 0, 'A'),
      leg('s2', 'sent', 5000, MIN, 'C'),
      leg('i', 'inflow', 5000, 2 * MIN, 'B'),
    ])
    expect(result.pairs).toEqual([])
    expect(result.unmatched).toEqual(['s1', 's2', 'i'])
  })

  it('pairs nothing when one transfer sent could go with two inflows', () => {
    const result = matchTransferLegs([
      leg('s', 'sent', 5000, 0, 'A'),
      leg('i1', 'inflow', 5000, MIN, 'B'),
      leg('i2', 'inflow', 5000, 2 * MIN, 'C'),
    ])
    expect(result.pairs).toEqual([])
  })

  it('pairs the clear match and leaves the stray alone', () => {
    const result = matchTransferLegs([
      leg('s', 'sent', 5000, 0, 'A'),
      leg('i', 'inflow', 5000, MIN, 'B'),
      leg('stray', 'inflow', 700, MIN, 'B'),
    ])
    expect(result.pairs).toEqual([{ sentId: 's', inflowId: 'i' }])
    expect(result.unmatched).toEqual(['stray'])
  })
})
