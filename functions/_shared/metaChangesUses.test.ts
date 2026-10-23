/**
 * On D1, `meta.changes` is every row a statement and its triggers changed, so a statement on `transactions` reports
 * about three rows for each one it touches once the rollup triggers exist (docs/decisions/ledger-rollup.md). A count
 * that reaches a client or a decision must be read (a `COUNT(*)` in the same batch, or `RETURNING`), and never taken
 * from `meta.changes`. This lists every use there is, with why it is safe: it asks only whether any row changed, or
 * the statement is on a table no trigger writes through. A new use fails here until it is listed with its reason.
 */
import { describe, expect, it } from 'vitest'

const sources = import.meta.glob<string>(
  [
    '/functions/**/*.{ts,mjs}',
    '!/functions/**/*.test.ts',
    '!/functions/_shared/testing/**',
    '/scripts/**/*.{ts,mjs}',
    '!/scripts/**/*.test.ts',
    '/workers/**/*.ts',
    '!/workers/**/*.test.ts',
    '/src/**/*.{ts,tsx}',
    '!/src/**/*.test.{ts,tsx}',
  ],
  { query: '?raw', import: 'default', eager: true },
)

/** The uses of `meta.changes` per file, and why each is safe. */
const LISTED: Record<string, { uses: number; why: string }> = {
  '/functions/_shared/access/accessDb.ts': { uses: 2, why: 'access tables, tested for > 0' },
  '/functions/_shared/dbBulkEdit.ts': { uses: 1, why: 'label links inserted: transaction_labels has no trigger' },
  '/functions/_shared/dbConfig.ts': { uses: 5, why: 'a deleted category, account, scenario: tested for 0 to answer 404' },
  '/functions/_shared/dbInstallments.ts': { uses: 1, why: 'the plan delete, tested for 0 to answer 404' },
  '/functions/_shared/dbLabels.ts': { uses: 1, why: 'label links deleted: transaction_labels has no trigger' },
  '/functions/_shared/dbWealth.ts': { uses: 2, why: 'wealth rows, tested for 0 to answer 404' },
  '/functions/_shared/dbWrite.ts': { uses: 1, why: 'deleteTransaction tests for 0 to answer 404; no row means no trigger fires' },
  '/functions/_shared/descriptionNormBackfill.ts': { uses: 1, why: 'sets description_norm only, which no trigger watches' },
  '/scripts/scaling/cleanup.ts': { uses: 1, why: 'a chunk delete tested for 0 to end the loop' },
  '/scripts/scaling/transport.ts': { uses: 2, why: 'passes the reply through' },
}

const withoutComments = (text: string): string => text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

describe('every use of meta.changes', () => {
  it('is listed with the reason it cannot be inflated by a trigger', () => {
    const found: Record<string, number> = {}
    for (const [file, text] of Object.entries(sources)) {
      const uses = withoutComments(text).match(/meta\??\.changes/g)?.length ?? 0
      if (uses > 0) found[file] = uses
    }
    expect(found).toEqual(Object.fromEntries(Object.entries(LISTED).map(([file, { uses }]) => [file, uses])))
  })

  it('names a reason for each', () => {
    for (const [file, { why }] of Object.entries(LISTED)) expect(why.length, file).toBeGreaterThan(10)
  })
})
