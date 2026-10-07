/**
 * Rules for migration files, checked in CI before a migration can be merged.
 *
 * A migration reaches a live database exactly once, and nothing runs it again, so the mistakes
 * worth catching are the ones that cannot be taken back or that only fail on a populated
 * database. Each rule that can legitimately be broken is broken by a comment on the line above
 * the statement, with a reason, so the decision is written down where a reviewer sees it:
 *
 *   -- lint-allow: destructive the old column has had no reader since the last release
 *   -- lint-allow: unscoped the table is empty in every environment
 *
 * Statements are split on `;` and comments are dropped, the way the documented `--command`
 * fallback and the schema check read a file. That is enough for what migrations here contain,
 * but a `;` inside a string or a trigger body would be split wrongly.
 */

/** Migrations up to this number are already applied everywhere and were judged when written. */
export const GRANDFATHERED_THROUGH = 31

/**
 * @typedef {{ notes: string[], sql: string }} Statement
 */

/**
 * The statements of a file, each with the comment lines directly above it.
 * @param {string} text
 * @returns {Statement[]}
 */
export function statementsOf(text) {
  return text
    .split(';')
    .map((chunk) => {
      const notes = []
      const code = []
      for (const line of chunk.split('\n')) {
        const trimmed = line.trim()
        if (trimmed.startsWith('--')) {
          if (code.length === 0) notes.push(trimmed.replace(/^--\s?/, ''))
          continue
        }
        const bare = trimmed.replace(/--.*$/, '').trim()
        if (bare) code.push(bare)
      }
      return { notes, sql: code.join(' ').replace(/\s+/g, ' ') }
    })
    .filter((statement) => statement.sql)
}

/** @param {Statement} statement @param {string} kind */
const allowed = (statement, kind) =>
  statement.notes.some((note) => new RegExp(`^lint-allow: ${kind} \\S`).test(note))

/**
 * What is wrong with one migration file; an empty list means nothing.
 * @param {string} file
 * @param {string} text
 * @returns {string[]}
 */
export function lintMigration(file, text) {
  const problems = []
  if (!/^\d{4}_[a-z0-9_]+\.sql$/.test(file)) {
    problems.push(`${file}: name it NNNN_lower_snake_case.sql`)
  }
  const statements = statementsOf(text)
  if (statements.length === 0) problems.push(`${file}: contains no statements`)

  for (const statement of statements) {
    const sql = statement.sql
    const shown = sql.length > 70 ? `${sql.slice(0, 70)}…` : sql

    const destroys = /^DROP\s+(TABLE|COLUMN)\b/i.test(sql) || /^ALTER\s+TABLE\s+\S+\s+(DROP\s+COLUMN|RENAME)\b/i.test(sql)
    if (destroys && !allowed(statement, 'destructive')) {
      problems.push(
        `${file}: "${shown}" drops or renames something the code now running may still read. ` +
          `Ship the code that stops using it first, then add "-- lint-allow: destructive <why it is safe>" above it.`,
      )
    }

    const writesEveryRow = /^(UPDATE|DELETE)\b/i.test(sql) && !/\bWHERE\b/i.test(sql)
    if (writesEveryRow && !allowed(statement, 'unscoped')) {
      problems.push(
        `${file}: "${shown}" changes every row. Scope it with WHERE to the rows it means, or add ` +
          `"-- lint-allow: unscoped <why every row is meant>" above it.`,
      )
    }

    const creates = /^CREATE\s+(UNIQUE\s+)?(TABLE|INDEX|VIEW|TRIGGER)\b/i.test(sql)
    if (creates && !/^CREATE\s+(UNIQUE\s+)?(TABLE|INDEX|VIEW|TRIGGER)\s+IF\s+NOT\s+EXISTS\b/i.test(sql)) {
      problems.push(`${file}: "${shown}" needs IF NOT EXISTS, so applying it twice is a no-op and not an error.`)
    }
  }
  return problems
}

/**
 * Numbers that must run 0001, 0002, ... with none missing or repeated. Two PRs that each add
 * the next number would otherwise both merge, and the second file would sort between two
 * others in some databases.
 * @param {string[]} files
 * @returns {string[]}
 */
export function lintNumbering(files) {
  const names = files.filter((f) => f.endsWith('.sql')).sort()
  const problems = []
  const seen = new Map()
  for (const name of names) {
    const n = Number(name.slice(0, 4))
    if (seen.has(n)) problems.push(`${name} and ${seen.get(n)} both use number ${String(n).padStart(4, '0')}`)
    seen.set(n, name)
  }
  const numbers = [...seen.keys()].sort((a, b) => a - b)
  const gap = numbers.findIndex((n, i) => n !== i + 1)
  if (gap !== -1) {
    problems.push(`numbering skips from ${String(gap).padStart(4, '0')} to ${String(numbers[gap]).padStart(4, '0')} at ${seen.get(numbers[gap])}`)
  }
  return problems
}
