import { describe, expect, it } from 'vitest'
import { EXPORT_TABLES } from '../domain/data/exportTables'
import { migratedDatabase } from '../../src/testing/sqliteD1'
import { emptyTables, literal, placeholderKey, restoreScript, restoreStatements, tablesOfDataset } from './restoreSql'
import { syntheticLedger } from '../../src/testing/syntheticLedger'
import { defaultExpenseSettings } from '../domain/engine/defaults'

describe('literal', () => {
  it('writes numbers as they are and null as NULL', () => {
    expect(literal(0)).toBe('0')
    expect(literal(-250_000)).toBe('-250000')
    expect(literal(0.025)).toBe('0.025')
    expect(literal(null)).toBe('NULL')
  })

  it('quotes text and doubles its quotes, so nothing in a description can end the string', () => {
    expect(literal('Café')).toBe("'Café'")
    expect(literal("O'Brien's; DROP TABLE transactions; --")).toBe("'O''Brien''s; DROP TABLE transactions; --'")
    expect(literal('two\nlines')).toBe("'two\nlines'")
  })

  it('refuses what SQLite text cannot hold, and numbers that are not numbers', () => {
    expect(() => literal('a\u0000b')).toThrow('NUL')
    expect(() => literal(Number.NaN)).toThrow('Cannot restore the number')
    expect(() => literal(Number.POSITIVE_INFINITY)).toThrow('Cannot restore the number')
  })

  it('round-trips awkward text through a real SQLite database', () => {
    const db = migratedDatabase()
    const awkward = ["it's", '100% _ done', 'мосва café ß', '"quoted"', 'a;b', 'tab\there', '\\backslash', '']
    for (const text of awkward) {
      const row = db.prepare(`SELECT ${literal(text)} AS v`).get() as { v: string }
      expect(row.v).toBe(text)
    }
  })
})

describe('restoreStatements', () => {
  it('is nothing for a ledger with nothing in it', () => {
    expect(restoreStatements('a@b.com', emptyTables())).toEqual([])
  })

  it('writes the owner it is given on every row, whoever the backup was of', () => {
    const tables = tablesOfDataset(syntheticLedger({ months: 2, perMonth: 5, seed: 1 }))
    const statements = restoreStatements('new@example.com', tables)

    const withOwner = statements.filter((s) => /INSERT INTO (categories|accounts|labels|flags|transactions)\b/.test(s))
    expect(withOwner.length).toBeGreaterThan(10)
    for (const sql of withOwner) expect(sql).toContain("'new@example.com'")
    expect(statements.join('\n')).not.toContain('owner@example.com')
  })

  it('inserts a table only after the tables its rows refer to (the wealth tables, which this ledger lacks, are held to it by the restore of a full ledger)', () => {
    const tables = tablesOfDataset(syntheticLedger({ months: 3, perMonth: 20, seed: 4 }))
    const order = restoreStatements('a@b.com', tables).map((s) => /INSERT INTO (\w+)/.exec(s)![1])
    const first = (name: string) => order.indexOf(name)

    expect(first('categories')).toBeLessThan(first('transactions'))
    expect(first('accounts')).toBeLessThan(first('transactions'))
    expect(first('labels')).toBeLessThan(first('flags'))
    expect(first('installment_plans')).toBeLessThan(first('transactions'))
    expect(first('transactions')).toBeLessThan(first('transaction_labels'))
    expect(first('transactions')).toBeLessThan(first('transaction_attachments'))
  })

  it('stores the normalized description beside each description', () => {
    const tables = emptyTables()
    tables.transactions = [
      { id: 1, date: '2026-01-02', budgetMonth: '2026-01', description: '  Café   Au Lait ', accountId: 1, categoryId: 1, type: 'expense', amountCents: 450, cancelled: false, labelIds: [] },
    ]

    const [sql] = restoreStatements('a@b.com', tables)

    expect(sql).toContain('description_norm')
    expect(sql).toContain("'café   au lait'")
  })

  it('gives a restored receipt a key that names nothing, and no thumbnail key when it had none', () => {
    const tables = emptyTables()
    tables.attachments = [
      { id: 7, transactionId: 1, contentType: 'image/jpeg', byteSize: 10, createdAt: '2026-01-02', hasThumb: true },
      { id: 8, transactionId: 1, contentType: 'application/pdf', byteSize: 10, createdAt: '2026-01-02', hasThumb: false },
    ]

    const [withThumb, without] = restoreStatements('a@b.com', tables)

    expect(withThumb).toContain(`'${placeholderKey('a@b.com', 7)}'`)
    expect(withThumb).toContain(`'${placeholderKey('a@b.com', 7, true)}'`)
    expect(without).toContain(`'${placeholderKey('a@b.com', 8)}', NULL`)
    expect(placeholderKey('a@b.com', 7)).toBe('restored/a@b.com/7')
  })

  it('keeps null where the dataset has no value, and writes booleans as 0 and 1', () => {
    const tables = emptyTables()
    tables.categories = [{ id: 1, name: 'Food', monthlyBudgetCents: 0, sortOrder: 0, active: false }]

    expect(restoreStatements('a@b.com', tables)).toEqual([
      "INSERT INTO categories (id, owner, name, monthly_budget_cents, sort_order, icon, color, active) VALUES (1, 'a@b.com', 'Food', 0, 0, NULL, NULL, 0)",
    ])
  })

  it('writes the settings of the dataset, defaults included, and the check-in entries beside their check-in', () => {
    const tables = emptyTables()
    tables.settings = [defaultExpenseSettings()]
    tables.wealthCheckins = [{ id: 3, checkinDate: '2026-06-01', createdAt: '2026-06-01 10:00:00', entries: [{ accountId: 2, valueCents: 500 }, { accountId: 4, valueCents: 700 }] }]

    const statements = restoreStatements('a@b.com', tables)

    expect(statements.filter((s) => s.startsWith('INSERT INTO settings'))).toHaveLength(1)
    expect(statements.filter((s) => s.startsWith('INSERT INTO wealth_checkin_entries'))).toHaveLength(2)
  })

  it('has a mapper for every table of the export, so a new table cannot be backed up and not restored', () => {
    const tables = emptyTables()
    for (const table of EXPORT_TABLES) expect(tables[table]).toEqual([])
    expect(Object.keys(tables).sort()).toEqual([...EXPORT_TABLES].sort())
  })
})

describe('restoreScript', () => {
  it('is the statements, a line each, under a comment that says what it is for', () => {
    const tables = tablesOfDataset(syntheticLedger({ months: 1, perMonth: 4, seed: 2 }))
    const statements = restoreStatements('a@b.com', tables)

    const script = restoreScript('a@b.com', tables, '2026-10-19T04:00:00.000Z')

    const lines = script.split('\n')
    expect(lines[0]).toBe(`-- Restore of one owner: ${statements.length} statements, generated 2026-10-19T04:00:00.000Z.`)
    expect(lines[1]).toContain('none of this owner')
    expect(lines.filter((l) => l.startsWith('INSERT'))).toHaveLength(statements.length)
    expect(lines.filter((l) => l.startsWith('INSERT')).every((l) => l.endsWith(';'))).toBe(true)
  })
})
