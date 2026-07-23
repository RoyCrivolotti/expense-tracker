import { describe, expect, it } from 'vitest'
import type { Account, ExpenseSettings } from '../types'
import { defaultExpenseSettings } from '../engine'
import { resolveDefaultAccountId } from './defaultAccount'

const accounts: Account[] = [
  { id: 1, name: 'Debit', kind: 'debit', settlement: 'immediate', active: true },
  { id: 2, name: 'Iberia', kind: 'credit', settlement: 'deferred', active: true },
]

const settings: ExpenseSettings = defaultExpenseSettings()

describe('resolveDefaultAccountId', () => {
  it('uses configured default when valid', () => {
    expect(resolveDefaultAccountId(accounts, { ...settings, defaultAccountId: 2 })).toBe(2)
  })

  it('falls back when default is missing, inactive, or unknown', () => {
    expect(resolveDefaultAccountId(accounts, settings)).toBe(1)
    expect(
      resolveDefaultAccountId([{ ...accounts[0]!, active: false }, accounts[1]!], {
        ...settings,
        defaultAccountId: 1,
      }),
    ).toBe(2)
    expect(resolveDefaultAccountId(accounts, { ...settings, defaultAccountId: 99 })).toBe(1)
  })
})
