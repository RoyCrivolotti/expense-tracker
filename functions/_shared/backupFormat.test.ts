import { describe, expect, it } from 'vitest'
import { EXPORT_FORMAT } from '../domain/data/exportTables'
import { BACKUP_FORMAT, BackupFormatError, emptyCounts, parseBackupManifest, parseBackupState, type BackupManifest, type BackupState } from './backupFormat'

const state = (over: Partial<BackupState> = {}): BackupState => ({
  format: BACKUP_FORMAT,
  owner: 'a@b.com',
  dateKey: '2026-10-15',
  startedAt: '2026-10-15T04:00:00.000Z',
  revision: 'abc',
  table: 3,
  after: '40',
  nextPart: 2,
  parts: [{ key: 'a@b.com/2026-10-15/part-000001.ndjson', rows: 10, bytes: 900 }],
  counts: emptyCounts(),
  ...over,
})

const manifest = (over: Record<string, unknown> = {}): string =>
  JSON.stringify({
    format: BACKUP_FORMAT,
    exportFormat: EXPORT_FORMAT,
    owner: 'a@b.com',
    dateKey: '2026-10-15',
    startedAt: 's',
    finishedAt: 'f',
    revision: 'abc',
    consistent: true,
    tables: emptyCounts(),
    parts: [],
    bytes: 0,
    ...over,
  })

describe('parseBackupState', () => {
  it('reads a state this code wrote, for this owner and day', () => {
    expect(parseBackupState(JSON.stringify(state()), 'a@b.com', '2026-10-15')).toEqual(state())
    expect(parseBackupState(JSON.stringify(state({ revision: null, after: null })), 'a@b.com', '2026-10-15')?.after).toBeNull()
  })

  it.each([
    ['nothing saved', null],
    ['text that is not JSON', '{ nope'],
    ['JSON that is not an object', '[1,2]'],
    ['another format', JSON.stringify({ ...state(), format: 2 })],
    ['another owner', JSON.stringify(state({ owner: 'c@d.com' }))],
    ['another day', JSON.stringify(state({ dateKey: '2026-10-14' }))],
    ['a table past the end', JSON.stringify(state({ table: 99 }))],
    ['a negative part number', JSON.stringify(state({ nextPart: -1 }))],
    ['a part that is not one', JSON.stringify({ ...state(), parts: [{ key: 1 }] })],
    ['counts that are missing a table', JSON.stringify({ ...state(), counts: { categories: 1 } })],
    ['a position that is not text', JSON.stringify({ ...state(), after: 40 })],
    ['no start time', JSON.stringify({ ...state(), startedAt: undefined })],
  ])('is nothing for %s, so the run starts again', (_name, text) => {
    expect(parseBackupState(text, 'a@b.com', '2026-10-15')).toBeNull()
  })
})

describe('parseBackupManifest', () => {
  it('reads a manifest this code wrote', () => {
    const read: BackupManifest = parseBackupManifest(manifest())
    expect(read.owner).toBe('a@b.com')
    expect(read.consistent).toBe(true)
  })

  it.each([
    ['text that is not JSON', 'nope', 'Not a backup manifest'],
    ['another format', manifest({ format: 9 }), 'Not a backup manifest'],
    ['rows exported in another format', manifest({ exportFormat: EXPORT_FORMAT + 1 }), 'exported in format'],
    ['no owner', manifest({ owner: undefined }), 'incomplete'],
    ['counts for too few tables', manifest({ tables: { categories: 1 } }), 'incomplete'],
    ['a part that is not one', manifest({ parts: ['x'] }), 'incomplete'],
  ])('throws for %s', (_name, text, message) => {
    expect(() => parseBackupManifest(text)).toThrow(BackupFormatError)
    expect(() => parseBackupManifest(text)).toThrow(message)
  })
})
