import { describe, expect, it } from 'vitest'
import { KIND_RULES, matchRule } from './classify'
import type { KindRule } from './types'

const iberia = { source: 'iberia' as const, body: 'whatever' }

describe('matchRule', () => {
  it('recognises the Iberia purchase push by its title', () => {
    expect(matchRule({ ...iberia, title: 'Compra realizada' })?.kind).toBe('card-purchase')
  })

  it('ignores case and accents in the title', () => {
    expect(matchRule({ ...iberia, title: ' COMPRA realizada ' })?.kind).toBe('card-purchase')
  })

  it('drops a kind that is not on the list, such as an instalment offer that repeats a purchase', () => {
    expect(matchRule({ ...iberia, title: 'Fraccionar compra' })).toBeNull()
    expect(matchRule({ ...iberia, title: 'Your code is 123456' })).toBeNull()
  })

  it('does not apply one source’s rule to the other source', () => {
    expect(matchRule({ source: 'santander', body: 'x', title: 'Compra realizada' })).toBeNull()
  })

  it('tells two kinds apart by Body when they share a Title', () => {
    const rules: KindRule[] = [
      { source: 'santander', title: 'Same title', body: /purchase/i, kind: 'card-purchase', mark: 'dot', keepsText: true },
      { source: 'santander', title: 'Same title', body: /atm/i, kind: 'cash-withdrawal', mark: 'dot', keepsText: false },
    ]
    const base = { source: 'santander' as const, title: 'Same title' }
    expect(matchRule({ ...base, body: 'Approve ATM 20' }, rules)?.kind).toBe('cash-withdrawal')
    expect(matchRule({ ...base, body: 'Approve purchase 20' }, rules)?.kind).toBe('card-purchase')
    expect(matchRule({ ...base, body: 'Something else' }, rules)).toBeNull()
  })

  it('ships rules that fold to distinct source and title pairs', () => {
    const keys = KIND_RULES.map((r) => `${r.source}|${r.title.toLowerCase()}|${r.body ?? ''}`)
    expect(new Set(keys).size).toBe(keys.length)
  })
})
