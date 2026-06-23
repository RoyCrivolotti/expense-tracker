import { describe, expect, it } from 'vitest'
import { descriptionScore } from './merchantAliases'
import { parseBankAmountCents } from './parseAmount'
import { daysBetween, parseBankDate } from './parseDates'
import { reconcileDates } from './matchDates'
import type { Account, Category, StoredTransaction } from '../types'
import type { BankTransaction } from './types'

describe('parseBankDate', () => {
  it('parses DD/MM/YYYY', () => {
    expect(parseBankDate('03/01/2026')).toBe('2026-01-03')
  })
})

describe('parseBankAmountCents', () => {
  it('parses EU and US thousands', () => {
    expect(parseBankAmountCents('-57,83')).toBe(-5783)
    expect(parseBankAmountCents('-1,373.45')).toBe(-137345)
    expect(parseBankAmountCents('21.38')).toBe(2138)
  })
})

describe('descriptionScore', () => {
  it('links ChatGPT to OPENAI merchant text', () => {
    expect(descriptionScore('ChatGPT', 'OPENAI *CHATGPT SUBSCR')).toBeGreaterThan(0.8)
  })

  it('links Rent to Hamlet recibo', () => {
    expect(descriptionScore('Rent', 'Recibo Hamlet, S.a.')).toBeGreaterThan(0.8)
  })
})

describe('reconcileDates', () => {
  const accounts: Account[] = [
    { id: 1, name: 'Santander Debit', kind: 'debit', settlement: 'immediate', active: true },
    { id: 2, name: 'Iberia Icon', kind: 'credit', settlement: 'deferred', active: true },
  ]
  const categories: Category[] = [
    { id: 1, name: 'Subscriptions', monthlyBudgetCents: 0, sortOrder: 1, active: true },
    { id: 2, name: 'Home', monthlyBudgetCents: 0, sortOrder: 2, active: true },
  ]

  const bank: BankTransaction[] = [
    {
      date: '2026-01-03',
      amountCents: 2138,
      description: 'OPENAI *CHATGPT SUBSCR',
      source: 'iberia',
      kind: 'debit_direct',
    },
    {
      date: '2026-01-01',
      amountCents: 1599,
      description: 'Disney Plus',
      source: 'iberia',
      kind: 'debit_direct',
    },
    {
      date: '2026-01-04',
      amountCents: 145660,
      description: 'Recibo Hamlet, S.a.',
      source: 'debit_direct',
      kind: 'debit_direct',
    },
  ]

  const txns: StoredTransaction[] = [
    {
      id: 1,
      date: '2026-01-01',
      budgetMonth: '2026-01',
      description: 'ChatGPT',
      accountId: 2,
      categoryId: 1,
      type: 'expense',
      amountCents: 2138,
      cancelled: false,
    },
    {
      id: 2,
      date: '2026-01-01',
      budgetMonth: '2026-01',
      description: 'Disney',
      accountId: 2,
      categoryId: 1,
      type: 'expense',
      amountCents: 1599,
      cancelled: false,
    },
    {
      id: 3,
      date: '2026-01-01',
      budgetMonth: '2026-01',
      description: 'Rent',
      accountId: 1,
      categoryId: 2,
      type: 'expense',
      amountCents: 145660,
      cancelled: false,
    },
  ]

  it('proposes fix for ChatGPT and rent, keeps Disney on 1st', () => {
    const report = reconcileDates(txns, accounts, categories, bank)
    const chat = report.lines.find((l) => l.txnId === 1)
    const disney = report.lines.find((l) => l.txnId === 2)
    const rent = report.lines.find((l) => l.txnId === 3)

    expect(chat?.proposedDate).toBe('2026-01-03')
    expect(daysBetween(chat?.appDate ?? '', chat?.proposedDate ?? '')).toBe(2)
    expect(disney?.confidence).toBe('unchanged')
    expect(disney?.proposedDate).toBe('')
    expect(rent?.proposedDate).toBe('2026-01-04')
  })
})
