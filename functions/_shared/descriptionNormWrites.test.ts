/**
 * Reads the source for any statement that writes `transactions.description` and checks that it writes
 * `description_norm` beside it. The integration tests next to the transaction routes drive the paths
 * that exist; this one fails when someone adds another, in the API, in a script, a worker or a migration.
 * It reads text, so a statement built from a table name held in a variable is beyond it; the integration
 * tests are the backstop for that.
 */
import { describe, expect, it } from 'vitest'

const sources = import.meta.glob<string>(
  [
    '/functions/**/*.{ts,js,mjs}',
    '!/functions/**/*.test.ts',
    '/scripts/**/*.{ts,js,mjs,sql}',
    '!/scripts/**/*.test.ts',
    '/workers/**/*.{ts,js,mjs}',
    '!/workers/**/*.test.ts',
    '/src/**/*.{ts,tsx}',
    '!/src/**/*.test.{ts,tsx}',
  ],
  { query: '?raw', import: 'default', eager: true },
)

const migrations = import.meta.glob<string>('/migrations/*.sql', { query: '?raw', import: 'default', eager: true })

/** Migration 0038 added the column; a later one that writes a description has to keep it in step. */
const FIRST_WITH_COLUMN = 38

interface Statement {
  file: string
  text: string
}

/** The table, however it is quoted. */
const TABLE = '["`\\[]?transactions["`\\]]?'

/** Every `INSERT [OR ...] INTO` or `REPLACE INTO transactions`, with what follows the table name up to the end of its column list. */
const INSERT = new RegExp(`(?:INSERT\\s+(?:OR\\s+\\w+\\s+)?|REPLACE\\s+)INTO\\s+${TABLE}\\s*(\\([^)]*\\))?`, 'gi')

/** Where the assignments of an `UPDATE [OR ...] transactions SET` begin. */
const UPDATE_START = new RegExp(`UPDATE\\s+(?:OR\\s+\\w+\\s+)?${TABLE}\\s+SET\\s+`, 'gi')

/**
 * The assignments of an UPDATE: from after SET to the WHERE or RETURNING that belongs to the statement itself
 * (not one inside a subselect in a value), or to the end of the string or statement that holds it.
 */
export function setClause(text: string, from: number): string {
  let depth = 0
  for (let i = from; i < text.length; i += 1) {
    const ch = text[i]!
    if (ch === '(') depth += 1
    else if (ch === ')') depth -= 1
    else if (depth <= 0 && (ch === '`' || ch === ';')) return text.slice(from, i)
    else if (depth === 0 && /\s/.test(ch)) {
      const rest = text.slice(i + 1, i + 10)
      if (/^(where|returning)\b/i.test(rest)) return text.slice(from, i)
    }
  }
  return text.slice(from)
}

const updateClauses = (text: string): string[] => [...text.matchAll(UPDATE_START)].map((m) => setClause(text, m.index + m[0].length))

function inserts(): Statement[] {
  const found: Statement[] = []
  for (const [file, text] of Object.entries(sources)) {
    for (const match of text.matchAll(INSERT)) found.push({ file, text: match[1] ?? '' })
  }
  return found
}

function updates(): Statement[] {
  return Object.entries(sources).flatMap(([file, text]) => updateClauses(text).map((clause) => ({ file, text: clause })))
}

const sets = (clause: string): boolean => /(^|,)\s*description\s*=/.test(clause)

/** The code of a file without its comments, so a comment cannot stand in for the call it talks about. */
const withoutComments = (text: string): string => text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

describe('the statements that write a transaction description', () => {
  it('finds the ones this test exists to watch', () => {
    const files = new Set(inserts().map((s) => s.file))
    expect(files).toEqual(
      new Set([
        '/functions/_shared/dbWrite.ts',
        '/functions/_shared/dbInstallmentBackfill.ts',
        '/scripts/gen-seed-sql.ts',
        '/scripts/gen-demo-seed-sql.ts',
        '/src/testing/seedSqlite.ts',
      ]),
    )
    expect(updates().length).toBeGreaterThan(5)
    expect(Object.keys(migrations).length).toBeGreaterThan(30)
  })

  it('every INSERT INTO transactions names its columns, and names description_norm beside description', () => {
    for (const { file, text } of inserts()) {
      expect(text, `${file}: an INSERT with no column list cannot be checked`).not.toBe('')
      if (/\bdescription\b/.test(text)) expect(text, file).toMatch(/\bdescription_norm\b/)
    }
  })

  it('every UPDATE transactions that sets description sets description_norm', () => {
    for (const { file, text } of updates()) {
      if (sets(text)) expect(text, file).toMatch(/\bdescription_norm\s*=/)
    }
  })

  it('every UPDATE transactions built from a patch’s keys is built by a file that adds the normalization', () => {
    for (const { file, text } of updates()) {
      if (text.includes('${')) expect(withoutComments(sources[file]!), file).toContain('descriptionNormSets(')
    }
  })

  it('every migration after the column that writes transactions keeps it in step', () => {
    for (const [path, text] of Object.entries(migrations)) {
      const number = Number(path.match(/\/(\d{4})_/)?.[1])
      if (number <= FIRST_WITH_COLUMN) continue
      const sql = text
        .split('\n')
        .filter((line) => !line.trim().startsWith('--'))
        .join('\n')
      for (const match of sql.matchAll(INSERT)) {
        expect(match[1] ?? '', `${path}: an INSERT with no column list`).not.toBe('')
        if (/\bdescription\b/.test(match[1]!)) expect(match[1], path).toMatch(/\bdescription_norm\b/)
      }
      for (const clause of updateClauses(sql)) {
        if (sets(clause)) expect(clause, path).toMatch(/\bdescription_norm\s*=/)
      }
      expect(sql, `${path}: a table rebuild loses the column`).not.toMatch(/DROP\s+TABLE\s+(IF\s+EXISTS\s+)?["`]?transactions\b/i)
    }
  })

  it('recognizes a statement that forgets, however it is spelled', () => {
    const forgets = (statement: string): boolean => {
      const clauses = updateClauses(statement)
      const writesDescription =
        [...statement.matchAll(INSERT)].some((m) => /\bdescription\b/.test(m[1] ?? '') && !/\bdescription_norm\b/.test(m[1]!)) ||
        clauses.some((c) => sets(c) && !/\bdescription_norm\s*=/.test(c))
      const noColumns = [...statement.matchAll(INSERT)].some((m) => m[1] === undefined)
      return writesDescription || noColumns
    }
    expect(forgets('INSERT INTO transactions (owner, date, description, amount_cents) VALUES (?, ?, ?, ?)')).toBe(true)
    expect(forgets('INSERT INTO "transactions" (owner, description) VALUES (?, ?)')).toBe(true)
    expect(forgets('INSERT INTO `transactions` (owner, description) VALUES (?, ?)')).toBe(true)
    expect(forgets('INSERT OR REPLACE INTO transactions (owner, description) VALUES (?, ?)')).toBe(true)
    expect(forgets('INSERT OR IGNORE INTO transactions (owner, description) VALUES (?, ?)')).toBe(true)
    expect(forgets('REPLACE INTO transactions (owner, description) VALUES (?, ?)')).toBe(true)
    expect(forgets('INSERT INTO transactions VALUES (1, 2, 3)')).toBe(true)
    expect(forgets('INSERT INTO transactions SELECT * FROM other')).toBe(true)
    expect(forgets('UPDATE transactions SET description = ? WHERE id = ?')).toBe(true)
    expect(forgets('UPDATE transactions SET description = ?')).toBe(true)
    expect(forgets('UPDATE "transactions" SET description = ?')).toBe(true)
    expect(forgets('UPDATE OR ROLLBACK transactions SET notes = ?, description = ? WHERE id = ?')).toBe(true)
    expect(forgets("UPDATE transactions SET description = 'x'")).toBe(true)
    // A WHERE inside a subselect in an earlier assignment does not end the assignments.
    expect(forgets('UPDATE transactions SET notes = (SELECT n FROM t WHERE t.id = transactions.id), description = ? WHERE id = ?')).toBe(true)
    expect(forgets('UPDATE transactions SET description = ?, description_norm = ? WHERE id = ?')).toBe(false)
    expect(forgets('UPDATE transactions SET notes = ? WHERE id = ?')).toBe(false)
    // description in a WHERE is a condition, not an assignment.
    expect(forgets("UPDATE transactions SET notes = ? WHERE description = 'x'")).toBe(false)
    expect(forgets('INSERT INTO transactions (owner, description, description_norm) VALUES (?, ?, ?)')).toBe(false)
  })

  it('does not take a comment for the call it names', () => {
    expect(withoutComments('// descriptionNormSets(\nconst x = 1')).not.toContain('descriptionNormSets(')
    expect(withoutComments('/* descriptionNormSets( */ const x = 1')).not.toContain('descriptionNormSets(')
    expect(withoutComments('const sets = descriptionNormSets(keys, patch)')).toContain('descriptionNormSets(')
  })
})

/**
 * The seed generators build their INSERT text by template, so nothing runs it in a test. What can be checked is that
 * the column list and the values line up and that the value in the description_norm slot is the normalization.
 */
function topLevelValues(values: string): string[] {
  const out: string[] = []
  let depth = 0
  let current = ''
  for (const ch of values) {
    if (ch === '(' || ch === '{') depth += 1
    if (ch === ')' || ch === '}') depth -= 1
    if (ch === ',' && depth === 0) {
      out.push(current.trim())
      current = ''
    } else current += ch
  }
  out.push(current.trim())
  return out
}

describe('the seed generators', () => {
  for (const file of ['/scripts/gen-seed-sql.ts', '/scripts/gen-demo-seed-sql.ts']) {
    it(`${file} writes description_norm from normalizeDesc, in the slot its column list names`, () => {
      const statements = [...sources[file]!.matchAll(/INSERT INTO transactions \(([^)]*)\) VALUES \((.*)\);`/g)]
      expect(statements.length).toBeGreaterThan(0)
      for (const [, columns, values] of statements) {
        const names = columns!.split(',').map((c) => c.trim())
        const slots = topLevelValues(values!)
        expect(slots, 'one value for every column').toHaveLength(names.length)
        const norm = slots[names.indexOf('description_norm')]
        expect(norm).toMatch(/normalizeDesc\(\w+\.description\)/)
        expect(slots[names.indexOf('description')]).toMatch(/\.description\)/)
      }
    })
  }
})
