import { describe, expect, it } from 'vitest'
import { EXPORT_FORMAT } from '../domain/data/exportTables'
import { memoryBackupStore } from '../../src/testing/memoryBackupStore'
import { syntheticLedger } from '../../src/testing/syntheticLedger'
import { manifestKey, ownerBackupKey, partKey, stateKey } from './backupKeys'
import { BACKUP_FORMAT, BackupFormatError, emptyCounts } from './backupFormat'
import { readBackup } from './backupRestore'

const OWNER = 'a@b.com'
const DAY = '2026-10-15'

/** A finished two-part backup of three rows, written by hand. */
function backup(over: { parts?: Record<string, string>; manifest?: Record<string, unknown> } = {}) {
  const lines1 = [
    JSON.stringify({ t: 'categories', r: { id: 1, name: 'Food' } }),
    JSON.stringify({ t: 'categories', r: { id: 2, name: 'Rent' } }),
  ]
  const lines2 = [JSON.stringify({ t: 'accounts', r: { id: 1, name: 'Main' } })]
  const part1 = `${lines1.join('\n')}\n`
  const part2 = `${lines2.join('\n')}\n`
  const parts = { [partKey(OWNER, DAY, 1)]: part1, [partKey(OWNER, DAY, 2)]: part2, ...over.parts }
  const manifest = {
    format: BACKUP_FORMAT,
    exportFormat: EXPORT_FORMAT,
    owner: OWNER,
    dateKey: DAY,
    startedAt: 's',
    finishedAt: 'f',
    revision: 'r',
    consistent: true,
    tables: { ...emptyCounts(), categories: 2, accounts: 1 },
    parts: [
      { key: partKey(OWNER, DAY, 1), rows: 2, bytes: part1.length },
      { key: partKey(OWNER, DAY, 2), rows: 1, bytes: part2.length },
    ],
    bytes: part1.length + part2.length,
    ...over.manifest,
  }
  return memoryBackupStore({ ...parts, [manifestKey(OWNER, DAY)]: JSON.stringify(manifest) })
}

describe('readBackup of a chunked backup', () => {
  it('gathers the rows of every part into their tables', async () => {
    const read = await readBackup(backup(), OWNER, DAY)

    expect(read.kind).toBe('chunked')
    expect(read.tables.categories).toEqual([{ id: 1, name: 'Food' }, { id: 2, name: 'Rent' }])
    expect(read.tables.accounts).toEqual([{ id: 1, name: 'Main' }])
    expect(read.tables.transactions).toEqual([])
    expect(read.manifest?.consistent).toBe(true)
  })

  it('refuses a part that is not there', async () => {
    const store = backup()
    store.objects.delete(partKey(OWNER, DAY, 2))

    await expect(readBackup(store, OWNER, DAY)).rejects.toThrow('is missing')
  })

  it('refuses a part that is not the length the manifest recorded', async () => {
    const store = backup()
    store.objects.set(partKey(OWNER, DAY, 1), store.objects.get(partKey(OWNER, DAY, 1))!.slice(0, 20))

    await expect(readBackup(store, OWNER, DAY)).rejects.toThrow('characters, not the')
  })

  it('refuses a part with a different number of rows from the one recorded', async () => {
    const store = backup()
    const part = partKey(OWNER, DAY, 2)
    const padded = `${store.objects.get(part)!}\n\n`
    store.objects.set(part, padded)
    const manifest = JSON.parse(store.objects.get(manifestKey(OWNER, DAY))!)
    manifest.parts[1].bytes = padded.length
    manifest.parts[1].rows = 2
    store.objects.set(manifestKey(OWNER, DAY), JSON.stringify(manifest))

    await expect(readBackup(store, OWNER, DAY)).rejects.toThrow('holds 1 rows, not the 2')
  })

  it('refuses tables whose rows do not add up to the manifest’s counts', async () => {
    const store = backup({ manifest: { tables: { ...emptyCounts(), categories: 3, accounts: 1 } } })

    await expect(readBackup(store, OWNER, DAY)).rejects.toThrow('categories: the manifest records 3 rows and the parts hold 2')
  })

  it.each([
    ['not JSON', 'not json at all'],
    ['a table that does not exist', JSON.stringify({ t: 'users', r: { id: 1 } })],
    ['no row', JSON.stringify({ t: 'categories' })],
  ])('refuses a line that is %s', async (_name, line) => {
    const body = `${line}\n`
    const store = backup({
      parts: { [partKey(OWNER, DAY, 2)]: body },
      manifest: { parts: [{ key: partKey(OWNER, DAY, 2), rows: 1, bytes: body.length }], tables: emptyCounts() },
    })

    await expect(readBackup(store, OWNER, DAY)).rejects.toThrow(BackupFormatError)
  })

  it('does not read a run that has a state and no manifest: it is not a backup', async () => {
    const store = memoryBackupStore({ [stateKey(OWNER, DAY)]: '{}', [partKey(OWNER, DAY, 1)]: 'x' })

    await expect(readBackup(store, OWNER, DAY)).rejects.toThrow('There is no finished backup')
  })

  it('reads the backup of the owner and day asked for, and no other', async () => {
    const store = backup()

    await expect(readBackup(store, 'c@d.com', DAY)).rejects.toThrow('There is no finished backup')
    await expect(readBackup(store, OWNER, '2026-10-14')).rejects.toThrow('There is no finished backup')
  })
})

describe('readBackup of the single-file snapshot', () => {
  it('reads a whole dataset as the same tables', async () => {
    const dataset = syntheticLedger({ months: 2, perMonth: 8, seed: 5 })
    const store = memoryBackupStore({ [ownerBackupKey(OWNER, DAY)]: JSON.stringify(dataset) })

    const read = await readBackup(store, OWNER, DAY)

    expect(read.kind).toBe('snapshot')
    expect(read.manifest).toBeUndefined()
    expect(read.tables.transactions).toHaveLength(dataset.transactions.length)
    expect(read.tables.settings).toEqual([dataset.settings])
  })

  it('prefers a chunked backup when both exist for the day', async () => {
    const store = backup()
    store.objects.set(ownerBackupKey(OWNER, DAY), JSON.stringify(syntheticLedger({ months: 1, perMonth: 3, seed: 1 })))

    expect((await readBackup(store, OWNER, DAY)).kind).toBe('chunked')
  })

  it.each([
    ['not JSON', 'not json'],
    ['not a dataset', JSON.stringify({ hello: 'world' })],
    ['null', 'null'],
  ])('refuses a snapshot that is %s', async (_name, text) => {
    const store = memoryBackupStore({ [ownerBackupKey(OWNER, DAY)]: text })

    await expect(readBackup(store, OWNER, DAY)).rejects.toThrow(BackupFormatError)
  })
})
