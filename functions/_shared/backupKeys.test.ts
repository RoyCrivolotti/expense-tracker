import { describe, expect, it } from 'vitest'
import { backupFolder, backupUnitOf, dateKeyFromObjectKey, manifestKey, ownerBackupKey, partKey, stateKey } from './backupKeys'

describe('backup keys', () => {
  it('keep the single-file snapshot where it was', () => {
    expect(ownerBackupKey('a@b.com', '2026-10-15')).toBe('a@b.com/2026-10-15.json')
    expect(dateKeyFromObjectKey('a@b.com/2026-10-15.json')).toBe('2026-10-15')
  })

  it('put a chunked backup in a folder of its own, per owner and day', () => {
    expect(backupFolder('a@b.com', '2026-10-15')).toBe('a@b.com/2026-10-15/')
    expect(manifestKey('a@b.com', '2026-10-15')).toBe('a@b.com/2026-10-15/manifest.json')
    expect(stateKey('a@b.com', '2026-10-15')).toBe('a@b.com/2026-10-15/state.json')
    expect(partKey('a@b.com', '2026-10-15', 7)).toBe('a@b.com/2026-10-15/part-000007.ndjson')
  })

  it('sort parts in the order they were written', () => {
    const keys = [12, 2, 100, 1].map((n) => partKey('a@b.com', '2026-10-15', n))
    expect([...keys].sort()).toEqual([1, 2, 12, 100].map((n) => partKey('a@b.com', '2026-10-15', n)))
  })
})

describe('backupUnitOf', () => {
  it('is the file for a single-file snapshot, and the folder for every object in a chunked one', () => {
    expect(backupUnitOf('a@b.com/2026-10-15.json')).toEqual({
      unit: 'a@b.com/2026-10-15.json',
      owner: 'a@b.com',
      dateKey: '2026-10-15',
    })
    for (const key of [manifestKey('a@b.com', '2026-10-15'), stateKey('a@b.com', '2026-10-15'), partKey('a@b.com', '2026-10-15', 3)]) {
      expect(backupUnitOf(key)).toEqual({ unit: 'a@b.com/2026-10-15/', owner: 'a@b.com', dateKey: '2026-10-15' })
    }
  })

  it('is null for anything else in the bucket', () => {
    expect(backupUnitOf('manifest.json')).toBeNull()
    expect(backupUnitOf('a@b.com/notes.txt')).toBeNull()
    expect(backupUnitOf('a@b.com/2026-10/part-000001.ndjson')).toBeNull()
  })
})
