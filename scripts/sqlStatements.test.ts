// @vitest-environment node
// node:sqlite cannot be bundled for the default jsdom environment, and this suite is pure Node.
import { DatabaseSync } from 'node:sqlite'
import { describe, expect, it } from 'vitest'
import { splitStatements } from './sql-statements.mjs'

const sqlOf = (text: string) => splitStatements(text).map((statement) => statement.sql)

const TRIGGER = `CREATE TRIGGER IF NOT EXISTS t_after_insert AFTER INSERT ON t
BEGIN
  UPDATE totals SET n = n + 1 WHERE k = NEW.k;
  INSERT INTO log (k) VALUES (NEW.k);
END`

describe('plain statements', () => {
  it('splits on semicolons and drops empty statements and the trailing newline', () => {
    expect(sqlOf('CREATE TABLE a (x INTEGER);;\n\nCREATE INDEX i ON a (x);\n')).toEqual([
      'CREATE TABLE a (x INTEGER)',
      'CREATE INDEX i ON a (x)',
    ])
  })

  it('keeps the last statement when the file does not end in a semicolon', () => {
    expect(sqlOf('SELECT 1;\nSELECT 2')).toEqual(['SELECT 1', 'SELECT 2'])
  })

  it('returns nothing for a file that is only comments', () => {
    expect(splitStatements('-- nothing here\n/* or here; */\n')).toEqual([])
  })

  it('keeps line breaks inside a statement as they were written', () => {
    expect(sqlOf('ALTER TABLE t\n  ADD COLUMN c TEXT;')).toEqual(['ALTER TABLE t\n  ADD COLUMN c TEXT'])
  })

  it('reads Windows line endings', () => {
    const [first] = splitStatements('-- why\r\nSELECT 1;\r\n')

    expect(first).toEqual({ sql: 'SELECT 1', notes: ['why'] })
  })
})

describe('a semicolon that does not end a statement', () => {
  it.each([
    ["a string", "INSERT INTO t (v) VALUES ('a;b')"],
    ["a string with an escaped quote", "INSERT INTO t (v) VALUES ('it''s; fine')"],
    ["a double-quoted name", 'SELECT "odd;name" FROM t'],
    ["a backtick name", 'SELECT `odd;name` FROM t'],
    ["a bracketed name", 'SELECT [odd;name] FROM t'],
    ["a string holding a comment marker", "INSERT INTO t (v) VALUES ('-- not a comment; really')"],
    ["a string holding a block comment", "INSERT INTO t (v) VALUES ('/* nor; this */')"],
  ])('inside %s', (_, statement) => {
    expect(sqlOf(`${statement};\nSELECT 2;`)).toEqual([statement, 'SELECT 2'])
  })

  it('inside a line comment, even one with an apostrophe in it', () => {
    expect(sqlOf("-- it's one; thing\nSELECT 1; -- and; another\nSELECT 2;")).toEqual(['SELECT 1', 'SELECT 2'])
  })

  it('inside a block comment', () => {
    expect(sqlOf('SELECT 1 /* a; b */ + 2;')).toEqual(['SELECT 1   + 2'])
  })

  it('and a quote opened in a comment does not swallow the next statement', () => {
    expect(sqlOf("/* don't */ SELECT 1;\nSELECT 2;")).toEqual(['SELECT 1', 'SELECT 2'])
  })
})

describe('a trigger', () => {
  it('stays one statement however many it holds', () => {
    expect(sqlOf(`${TRIGGER};\nSELECT 1;`)).toEqual([TRIGGER, 'SELECT 1'])
  })

  it('stays whole with a CASE ... END in its body', () => {
    const trigger = `CREATE TRIGGER c AFTER UPDATE ON t
BEGIN
  UPDATE s SET v = CASE WHEN NEW.a > 0 THEN 1 ELSE 0 END WHERE k = NEW.k;
  UPDATE s SET w = w + 1;
END`

    expect(sqlOf(`${trigger};\nSELECT 1;`)).toEqual([trigger, 'SELECT 1'])
  })

  it('stays whole with CASE inside CASE, and with CASE in its WHEN', () => {
    const trigger = `CREATE TRIGGER c AFTER UPDATE ON t
WHEN CASE WHEN NEW.a THEN 1 ELSE 0 END = 1
BEGIN
  UPDATE s SET v = CASE WHEN NEW.a THEN CASE WHEN NEW.b THEN 1 ELSE 2 END ELSE 3 END;
  SELECT 1;
END`

    expect(sqlOf(`${trigger};\nSELECT 1;`)).toEqual([trigger, 'SELECT 1'])
  })

  it('stays whole with a semicolon in a string, and in a comment, in its body', () => {
    const trigger = `CREATE TRIGGER s AFTER INSERT ON t
BEGIN
  -- a note; with a semicolon
  INSERT INTO log (msg) VALUES ('one; two');
  /* and; this */ SELECT 1;
END`

    const [whole, after, ...rest] = sqlOf(`${trigger};\nSELECT 1;`)

    expect(after).toBe('SELECT 1')
    expect(rest).toEqual([])
    expect(whole).toContain("VALUES ('one; two');")
    expect(whole).not.toMatch(/a note|and; this/)
    expect(whole).toMatch(/^CREATE TRIGGER s[\s\S]*END$/)
  })

  it.each(['CREATE TEMP TRIGGER', 'CREATE TEMPORARY TRIGGER', 'create trigger'])('is recognised as %s', (head) => {
    const trigger = `${head} x AFTER INSERT ON t BEGIN SELECT 1; SELECT 2; end`

    expect(sqlOf(`${trigger};\nSELECT 3;`)).toEqual([trigger, 'SELECT 3'])
  })

  it('ends at the END that is not a CASE, so a statement after it is separate', () => {
    expect(sqlOf(`${TRIGGER};\nCREATE INDEX i ON t (k);\n${TRIGGER.replace('t_after', 'u_after')};`)).toHaveLength(3)
  })

  it('does not take a word that merely contains BEGIN, CASE or END for the keyword', () => {
    const trigger = `CREATE TRIGGER w AFTER INSERT ON t
BEGIN
  UPDATE s SET end_date = NEW.begin_at, case_id = NEW.end WHERE showcase = 1;
  SELECT 1;
END`

    expect(sqlOf(`${trigger};\nSELECT 2;`)).toEqual([trigger, 'SELECT 2'])
  })

  it('does not take a column called end, written after a dot, for the end of the trigger', () => {
    const trigger = 'CREATE TRIGGER e AFTER INSERT ON t BEGIN UPDATE s SET x = NEW.end; SELECT 1; END'

    expect(sqlOf(`${trigger};\nSELECT 2;`)).toEqual([trigger, 'SELECT 2'])
  })

  it('reads the real statements around it as before', () => {
    expect(sqlOf('BEGIN TRANSACTION;\nSELECT 1;\nCOMMIT;')).toEqual(['BEGIN TRANSACTION', 'SELECT 1', 'COMMIT'])
  })

  it('ends a trigger that was never given a body at its semicolon, so SQLite reports the mistake', () => {
    expect(sqlOf('CREATE TRIGGER broken AFTER INSERT ON t;\nSELECT 1;')).toEqual([
      'CREATE TRIGGER broken AFTER INSERT ON t',
      'SELECT 1',
    ])
  })

  it('is accepted by SQLite as the single statement it was cut to, and fires', () => {
    const db = new DatabaseSync(':memory:')
    db.exec('CREATE TABLE t (k TEXT); CREATE TABLE totals (k TEXT, n INTEGER); CREATE TABLE log (k TEXT)')
    db.exec("INSERT INTO totals VALUES ('a', 0)")
    for (const statement of sqlOf(`${TRIGGER};`)) db.exec(statement)

    db.exec("INSERT INTO t VALUES ('a')")

    expect(db.prepare('SELECT n FROM totals').get()).toEqual({ n: 1 })
    expect(db.prepare('SELECT count(*) AS c FROM log').get()).toEqual({ c: 1 })
  })
})

describe('notes', () => {
  it('collects the comment lines directly above a statement, without the dashes', () => {
    expect(splitStatements('-- one\n--   two\n-- three  \nSELECT 1;')).toEqual([
      { sql: 'SELECT 1', notes: ['one', '  two', 'three'] },
    ])
  })

  it('leaves out a comment that comes after the statement has started', () => {
    const [statement] = splitStatements('-- above\nSELECT 1 -- beside\n  + 2;')

    expect(statement?.notes).toEqual(['above'])
    expect(statement?.sql).toMatch(/^SELECT 1\s+\+ 2$/)
  })

  it('gives each statement its own notes, and none to one with nothing above it', () => {
    expect(splitStatements('-- first\nSELECT 1;\nSELECT 2;\n-- third\nSELECT 3;').map((s) => s.notes)).toEqual([
      ['first'],
      [],
      ['third'],
    ])
  })

  it('does not take a dash pair inside a string for a comment', () => {
    expect(splitStatements("SELECT '-- no';")).toEqual([{ sql: "SELECT '-- no'", notes: [] }])
  })
})

describe('input that is cut short', () => {
  it.each([
    ['a string', "SELECT 'open"],
    ['a block comment', 'SELECT 1; /* open'],
    ['a bracketed name', 'SELECT [open'],
    ['a line comment', 'SELECT 1; -- open'],
  ])('ends at the end of the text inside %s', (_, text) => {
    expect(() => splitStatements(text)).not.toThrow()
  })

  it('hands back what it has of an unterminated string, for SQLite to refuse', () => {
    expect(sqlOf("SELECT 'open; SELECT 2;")).toEqual(["SELECT 'open; SELECT 2;"])
  })
})
