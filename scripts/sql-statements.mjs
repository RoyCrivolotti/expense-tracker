/**
 * Splits the text of a migration into statements. Everything that reads a migration one statement at
 * a time uses this: the migration lint, the schema check, and the SQLite stand-in the tests run on.
 *
 * Splitting on every `;` is wrong for three things a migration can contain, and this keeps each whole:
 *
 *  - a `;` inside a string, a quoted name or a comment;
 *  - a trigger, `CREATE TRIGGER ... BEGIN stmt; stmt; END;`, whose body is several statements that
 *    SQLite only accepts as part of the one CREATE;
 *  - a `CASE ... END` inside that trigger, whose `END` is not the trigger's.
 *
 * Keywords are matched as whole words and never after a `.`, so `end_date` and `NEW.end` are not
 * read as `END`. An unquoted column named `begin`, `case` or `end` in a trigger would confuse it;
 * quote such a name.
 */

/**
 * @typedef {{ sql: string, notes: string[] }} Statement
 * `sql` is the statement as written, comments removed. `notes` are the `--` comments above it, in
 * order, without the dashes: where a migration says why a statement is allowed.
 */

const CLOSERS = { "'": "'", '"': '"', '`': '`', '[': ']' }
const WORD = /[A-Za-z_][A-Za-z0-9_$]*/y

/** The index just past the closer of a quoted run that opens at `from`; a doubled closer is an escape. */
function endOfQuoted(text, from) {
  const closer = CLOSERS[text[from]]
  for (let i = from + 1; i < text.length; i += 1) {
    if (text[i] !== closer) continue
    if (closer === ']' || text[i + 1] !== closer) return i + 1
    i += 1
  }
  return text.length
}

/** What the statement being read looks like so far. */
function freshStatement() {
  return { sql: '', notes: [], head: [], phase: 'header', cases: 0 }
}

/** `CREATE [TEMP | TEMPORARY] TRIGGER`, going by the first three words. */
function isTrigger({ head }) {
  return head[0] === 'CREATE' && (head[1] === 'TRIGGER' || (/^TEMP(ORARY)?$/.test(head[1] ?? '') && head[2] === 'TRIGGER'))
}

/** Moves a trigger through `header`, `body` (between BEGIN and its END) and `closed`. */
function onWord(statement, word, afterDot) {
  const upper = word.toUpperCase()
  if (statement.head.length < 3) statement.head.push(upper)
  if (afterDot || !isTrigger(statement)) return
  if (upper === 'CASE') statement.cases += 1
  else if (upper === 'BEGIN' && statement.phase === 'header' && statement.cases === 0) statement.phase = 'body'
  else if (upper === 'END' && statement.cases > 0) statement.cases -= 1
  else if (upper === 'END' && statement.phase === 'body') statement.phase = 'closed'
}

/** Reads the token at `from` into `statement` and returns the index after it. */
function take(text, from, statement) {
  const pair = text.slice(from, from + 2)
  if (pair === '--') {
    const end = text.indexOf('\n', from)
    const stop = end === -1 ? text.length : end
    if (!statement.sql.trim()) statement.notes.push(text.slice(from + 2, stop).replace(/^\s/, '').trimEnd())
    return stop
  }
  if (pair === '/*') {
    const end = text.indexOf('*/', from + 2)
    statement.sql += ' '
    return end === -1 ? text.length : end + 2
  }
  const ch = text[from] ?? ''
  if (ch in CLOSERS) {
    const end = endOfQuoted(text, from)
    statement.sql += text.slice(from, end)
    return end
  }
  WORD.lastIndex = from
  const word = WORD.exec(text)?.[0]
  if (word === undefined) {
    statement.sql += ch
    return from + 1
  }
  onWord(statement, word, text[from - 1] === '.')
  statement.sql += word
  return from + word.length
}

/**
 * The statements of a file, in order. A statement that is only comments is dropped. A `--` comment
 * counts as a note only while nothing of the statement has been written yet.
 * @param {string} text
 * @returns {Statement[]}
 */
export function splitStatements(text) {
  /** @type {Statement[]} */
  const found = []
  const keep = ({ sql, notes }) => {
    if (sql.trim()) found.push({ sql: sql.trim(), notes })
  }
  let current = freshStatement()
  let i = 0
  while (i < text.length) {
    if (text[i] === ';' && current.phase !== 'body') {
      keep(current)
      current = freshStatement()
      i += 1
    } else {
      i = take(text, i, current)
    }
  }
  keep(current)
  return found
}
