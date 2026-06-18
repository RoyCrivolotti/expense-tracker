import { describe, expect, it } from 'vitest'
import { parseWorkbookCsv } from './parseWorkbookCsv'

/** Minimal CSV slice: one real transaction and one zero-amount row (should be skipped). */
const MINIMAL_CSV = `
Category;Monthly Budget
Groceries;500,00 €

Accounts
Santander Debit
Iberia Icon

Budget Month;Date;Description;Account;Category;Type;Amount;Status;Notes
July;15 Jun 2026;Mercadona;Santander Debit;Groceries;Expense;12,50 €;Posted;
July;11 Jun 2026;;Iberia Icon;;Expense;0,00 €;Forecast;
`

describe('parseWorkbookCsv', () => {
  it('skips ledger rows with zero amount', () => {
    const dataset = parseWorkbookCsv(MINIMAL_CSV)
    expect(dataset.transactions).toHaveLength(1)
    expect(dataset.transactions[0]?.description).toBe('Mercadona')
    expect(dataset.transactions[0]?.amountCents).toBe(1250)
  })
})
