import { describe, expect, it } from 'vitest'
import { markOf, newRecorder, statementsSince, summarize, type StatementRecord } from './records'

const record = (sql: string, over: Partial<StatementRecord> = {}): StatementRecord => ({
  sql,
  rowsRead: 1,
  rowsWritten: 0,
  durationMs: 0.5,
  batch: false,
  write: false,
  ...over,
})

describe('statementsSince', () => {
  it('adds up repeats of one SQL text and keeps the order in which texts first ran', () => {
    const recorder = newRecorder()
    recorder.records.push(record('SELECT a'), record('SELECT b', { rowsRead: 5 }), record('SELECT a', { rowsRead: 3, durationMs: 1.5 }))
    expect(statementsSince(recorder, { records: 0 })).toEqual([
      { sql: 'SELECT a', runs: 2, rowsRead: 4, rowsWritten: 0, sqlMs: 2, batch: false },
      { sql: 'SELECT b', runs: 1, rowsRead: 5, rowsWritten: 0, sqlMs: 0.5, batch: false },
    ])
  })

  it('keeps a statement sent inside a batch apart from the same text sent on its own', () => {
    const recorder = newRecorder()
    recorder.records.push(record('UPDATE t SET x = ?', { batch: true, rowsWritten: 2, write: true }), record('UPDATE t SET x = ?', { rowsWritten: 1, write: true }))
    const totals = statementsSince(recorder, { records: 0 })
    expect(totals.map((t) => [t.batch, t.rowsWritten])).toEqual([[true, 2], [false, 1]])
  })

  it('leaves out what ran before the mark, and its totals match the summary of the same request', () => {
    const recorder = newRecorder()
    recorder.records.push(record('SELECT earlier'))
    recorder.calls = 1
    const mark = markOf(recorder)
    recorder.records.push(record('SELECT a'), record('INSERT b', { rowsRead: 0, rowsWritten: 8, write: true }))
    recorder.calls = 3
    const totals = statementsSince(recorder, mark)
    expect(totals.map((t) => t.sql)).toEqual(['SELECT a', 'INSERT b'])
    const summary = summarize(recorder, mark)
    expect(totals.reduce((sum, t) => sum + t.runs, 0)).toBe(summary.statements)
    expect(totals.reduce((sum, t) => sum + t.rowsRead, 0)).toBe(summary.rowsRead)
    expect(totals.reduce((sum, t) => sum + t.rowsWritten, 0)).toBe(summary.rowsWritten)
  })
})
