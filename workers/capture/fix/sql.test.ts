import { describe, expect, it } from 'vitest'
import { allEqual, assignments, literal, sqlFile } from './sql'

describe('the SQL text of the record files', () => {
  it('writes text quoted with its quote marks doubled, whole numbers as digits and null as NULL', () => {
    expect(literal("it's")).toBe("'it''s'")
    expect(literal('')).toBe("''")
    expect(literal(-1)).toBe('-1')
    expect(literal(null)).toBe('NULL')
  })

  it('refuses a number that is not a whole one, rather than write it rounded', () => {
    expect(() => literal(1.5)).toThrow('not a whole number: 1.5')
    expect(() => literal(Number.NaN)).toThrow()
  })

  it('guards a null column with IS NULL, so the guard can match it', () => {
    expect(allEqual({ id: 'a', txn_id: null, votes: 1 })).toBe("id = 'a' AND txn_id IS NULL AND votes = 1")
    expect(assignments({ txn_id: null, state: 'open' })).toBe("txn_id = NULL, state = 'open'")
  })

  it('puts one statement on each line', () => {
    expect(sqlFile(['SELECT 1', 'SELECT 2'])).toBe('SELECT 1;\nSELECT 2;\n')
    expect(sqlFile([])).toBe('')
  })
})
