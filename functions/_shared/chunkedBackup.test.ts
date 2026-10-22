// @vitest-environment node
/**
 * The resumable backup on the real SQL with the real migrations and an in-memory bucket: what it writes
 * restores, into an empty database, to the dataset it was made from; no invocation does more than its budget;
 * an invocation killed at any point is carried on by the next; and a run that never finishes is noticed.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import type { DatabaseSync } from 'node:sqlite'
import { EXPORT_TABLES } from '../domain/data/exportTables'
import type { BackupAlerts } from '../domain/ports/backupAlerts'
import type { ExpenseRepository } from '../domain/ports/expenseRepository'
import type { ExpenseDataset } from '../domain/types'
import { adversarialLedger } from '../../src/testing/adversarialLedger'
import { makeDataset } from '../../src/testing/factories'
import { memoryBackupStore, type MemoryBackupStore } from '../../src/testing/memoryBackupStore'
import { randomLedger } from '../../src/testing/randomLedger'
import { migratedDatabase, newStats, sqliteD1 } from '../../src/testing/sqliteD1'
import { syntheticLedger } from '../../src/testing/syntheticLedger'
import { OTHER_OWNER, OWNER, awkwardLedger, queryDb, shifted } from '../../src/testing/transactionQueryKit'
import { createD1ExpenseRepository } from './adapters/d1ExpenseRepository'
import { manifestKey, ownerBackupKey, partKey, stateKey } from './backupKeys'
import { parseBackupManifest } from './backupFormat'
import { readBackup } from './backupRestore'
import type { BackupPolicy } from './backupPolicy'
import { MAX_PASSES, READ_ROWS, SAVE_ROWS, runChunkedBackups, type ChunkedDeps } from './chunkedBackup'
import { resolveChunkedBackup } from './chunkedBackupSettings'
import { loadDataset } from './db'
import { readOwnerRevision } from './dbRevision'
import type { Env } from './env'
import { restoreStatements } from './restoreSql'
import { createExpenseWorld, pinClock, OWNER as WORLD_OWNER } from './testing/expenseWorld'
import { seedLedger } from './testing/seedLedger'
import { onRequestPut as putSettings } from '../api/expenses/settings/index'
import { onRequestPost as postScenario } from '../api/expenses/scenarios/index'
import { scenarioInput } from './testing/seedLedger'

const SLOW = 120_000
const DAY = '2026-10-15'
const NEXT_DAY = '2026-10-16'
const clockOf = (day: string) => () => new Date(`${day}T04:00:00Z`)

const policy: BackupPolicy = {
  retentionDays: 14,
  maxBucketBytes: 512 * 1024 * 1024,
  maxSnapshotBytes: 5 * 1024 * 1024,
  bucketAlertThresholdFraction: 0.8,
}

function alertsSpy(): BackupAlerts & { onLargeSnapshot: ReturnType<typeof vi.fn>; onBucketNearLimit: ReturnType<typeof vi.fn>; onIncompleteBackup: ReturnType<typeof vi.fn>; onInconsistentBackup: ReturnType<typeof vi.fn> } {
  return {
    onLargeSnapshot: vi.fn().mockResolvedValue(undefined),
    onBucketNearLimit: vi.fn().mockResolvedValue(undefined),
    onIncompleteBackup: vi.fn().mockResolvedValue(undefined),
    onInconsistentBackup: vi.fn().mockResolvedValue(undefined),
  }
}

interface Source {
  name: string
  env: Env
  sqlite: DatabaseSync
  owner: string
  repo: ExpenseRepository
  /** Every query the database was asked, counted at `prepare`. */
  queries: { count: number }
  dataset: ExpenseDataset
}

/** Wraps a D1 so that every statement prepared is counted, whoever prepares it. */
function counted(inner: D1Database): { d1: D1Database; queries: { count: number } } {
  const queries = { count: 0 }
  const d1 = {
    prepare: (sql: string) => {
      queries.count += 1
      return inner.prepare(sql)
    },
    batch: (statements: Parameters<D1Database['batch']>[0]) => inner.batch(statements),
  } as unknown as D1Database
  return { d1, queries }
}

async function sourceOf(name: string, dataset: ExpenseDataset): Promise<Source> {
  const kit = queryDb(dataset)
  const { d1, queries } = counted(kit.d1)
  const env: Env = { DB: d1 }
  return { name, env, sqlite: kit.sqlite, owner: OWNER, repo: createD1ExpenseRepository(env), queries, dataset: await loadDataset(env, OWNER) }
}

const sources: Source[] = []
let written: Source

beforeAll(async () => {
  pinClock('2026-10-15')
  const sqlite = migratedDatabase()
  const world = createExpenseWorld(sqlite, sqliteD1(sqlite, newStats()))
  await seedLedger(world)
  await world.call(putSettings, { method: 'PUT', path: '/settings', body: { openingCashCents: 123_400 } })
  // The migrations leave a settings row under a placeholder owner, who would be backed up as a second owner.
  sqlite.exec(`DELETE FROM settings WHERE owner <> '${WORLD_OWNER}'`)
  const { d1, queries } = counted(world.env.DB)
  const env: Env = { ...world.env, DB: d1 }
  written = { name: 'written through the API', env, sqlite, owner: WORLD_OWNER, repo: createD1ExpenseRepository(env), queries, dataset: await loadDataset(env, WORLD_OWNER) }
  sources.push(written)
  pinClock('2020-01-15')
  for (const [name, ledger] of [
    ['synthetic', syntheticLedger({ months: 12, perMonth: 30, seed: 3 })],
    ['adversarial', adversarialLedger()],
    ['random', randomLedger(2)],
    ['awkward', awkwardLedger()],
  ] as const) {
    sources.push(await sourceOf(name, ledger))
  }
})

afterAll(() => {
  vi.useRealTimers()
})

function depsOf(
  source: Source,
  store: MemoryBackupStore,
  over: Partial<ChunkedDeps> & { alerts?: BackupAlerts } = {},
): ChunkedDeps {
  return {
    repo: source.repo,
    store,
    alerts: alertsSpy(),
    policy,
    chunked: resolveChunkedBackup({ BACKUP_MODE: 'chunked' }),
    readRevision: async (owner) => (await readOwnerRevision(source.env.DB, owner)).token,
    ...over,
  }
}

/** Runs invocations on successive cron ticks of one day until the backup is complete; returns how many it took. */
async function untilComplete(deps: ChunkedDeps, day = DAY, limit = 400): Promise<number> {
  for (let i = 1; i <= limit; i += 1) {
    if ((await runChunkedBackups(deps, clockOf(day))).complete) return i
  }
  throw new Error('the backup did not finish')
}

const json = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T

/** The dataset as a JSON reader sees it, with the details a dataset leaves unordered settled. */
function settled(dataset: ExpenseDataset): unknown {
  return json({
    ...dataset,
    transactions: dataset.transactions.map((t) => ({ ...t, labelIds: [...(t.labelIds ?? [])].sort((a, b) => a - b) })),
    wealthCheckins: dataset.wealthCheckins.map((c) => ({ ...c, entries: [...c.entries].sort((a, b) => a.accountId - b.accountId) })),
  })
}

/** Rebuilds the backup in an empty database (with foreign keys on) and reads the dataset back out of it. */
async function restoredFrom(store: MemoryBackupStore, owner: string, day = DAY, strict = true): Promise<ExpenseDataset> {
  const { tables } = await readBackup(store, owner, day)
  const target = migratedDatabase()
  // The random and awkward ledgers are built with rows that point at accounts and labels that are not there, which
  // no database that enforces its foreign keys can hold; they are restored with the check off.
  if (!strict) target.exec('PRAGMA foreign_keys = OFF')
  // A migrated database is not quite empty: two migrations leave a settings row under a placeholder owner.
  target.exec('DELETE FROM settings')
  for (const sql of restoreStatements(owner, tables)) target.exec(sql)
  return loadDataset({ DB: sqliteD1(target) }, owner)
}

describe('a backup restores to the dataset it was made from', () => {
  it.each(['written through the API', 'synthetic', 'adversarial', 'random', 'awkward'])(
    'for the %s ledger, across several invocations of a small budget',
    async (name) => {
      const source = sources.find((s) => s.name === name)!
      const store = memoryBackupStore()
      const deps = depsOf(source, store, { chunked: { enabled: true, maxOperations: 14, maxRows: 1_500 } })

      const invocations = await untilComplete(deps)

      const restored = await restoredFrom(store, source.owner, DAY, !['random', 'awkward'].includes(name))
      expect(settled(restored)).toEqual(settled(source.dataset))
      if (source.dataset.transactions.length > 3_000) expect(invocations).toBeGreaterThan(2)
      const manifest = parseBackupManifest(store.objects.get(manifestKey(source.owner, DAY))!)
      expect(manifest.tables.transactions).toBe(source.dataset.transactions.length)
    },
    SLOW,
  )

  it('in one invocation when the ledger is small and the budget is the default', async () => {
    const store = memoryBackupStore()

    const invocations = await untilComplete(depsOf(written, store))

    expect(invocations).toBe(1)
    expect(settled(await restoredFrom(store, written.owner))).toEqual(settled(written.dataset))
  }, SLOW)

  it('leaves no state behind, and a manifest that lists exactly the parts it wrote', async () => {
    const store = memoryBackupStore()
    await untilComplete(depsOf(sources.find((s) => s.name === 'synthetic')!, store, { chunked: { enabled: true, maxOperations: 14, maxRows: 1_500 } }))

    const keys = [...store.objects.keys()].sort()
    const manifest = parseBackupManifest(store.objects.get(manifestKey(OWNER, DAY))!)

    expect(keys).not.toContain(stateKey(OWNER, DAY))
    expect(keys.filter((k) => k.includes('/part-'))).toEqual(manifest.parts.map((p) => p.key).sort())
    expect(manifest.parts[0]!.key).toBe(partKey(OWNER, DAY, 1))
    expect(manifest.bytes).toBe(manifest.parts.reduce((sum, p) => sum + p.bytes, 0))
  }, SLOW)

  it('does not write the single-file snapshot, and the folder is the owner’s alone', async () => {
    const store = memoryBackupStore()
    await untilComplete(depsOf(written, store))

    expect([...store.objects.keys()].every((k) => k.startsWith(`${WORLD_OWNER}/${DAY}/`))).toBe(true)
  })
})

describe('a ledger larger than one part', () => {
  it('is written as several parts, the state saved after every chunk, and restores whole', async () => {
    const source = await sourceOf('large', syntheticLedger({ months: 48, perMonth: 130, seed: 17 }))
    expect(source.dataset.transactions.length).toBeGreaterThan(READ_ROWS * 10)
    const store = memoryBackupStore()
    const deps = depsOf(source, store, { chunked: { enabled: true, maxOperations: 44, maxRows: 100_000 } })

    const invocations = await untilComplete(deps)

    const manifest = parseBackupManifest(store.objects.get(manifestKey(source.owner, DAY))!)
    // Every chunk of 500 rows is a read, a part and a save, so a ledger this size is more than one invocation.
    expect(invocations).toBeGreaterThan(1)
    expect(manifest.parts.length).toBeGreaterThan(1)
    expect(manifest.parts.slice(0, -1).every((part) => part.rows >= SAVE_ROWS)).toBe(true)
    expect(settled(await restoredFrom(store, source.owner))).toEqual(settled(source.dataset))
  }, SLOW)
})

describe('planning data that is stored as JSON', () => {
  it('survives a backup and a restore: milestones, goal levers, life events and the contribution schedule', async () => {
    pinClock('2026-10-15')
    const sqlite = migratedDatabase()
    const world = createExpenseWorld(sqlite, sqliteD1(sqlite, newStats()))
    await seedLedger(world)
    const settings = await world.call(putSettings, {
      method: 'PUT',
      path: '/settings',
      body: {
        openingCashCents: 250_000,
        milestones: [
          { amountCents: 1_000_000, label: "Pat's deposit; 'phase 1'", targetDate: '2027-06-30' },
          { amountCents: 5_000_000, label: '' },
        ],
        goalLevers: ['horizonYears', 'startInvestedCents'],
        cashReserveMonths: 3,
        claimantName: "O'Neil, Pat",
        currencyCode: 'USD',
        numberLocale: 'en-US',
      },
    })
    expect(settings.status).toBe(200)
    const scenario = await world.call(postScenario, {
      method: 'POST',
      path: '/scenarios',
      body: scenarioInput({
        name: "Pat's \"plan\"",
        lifeEvents: [{ year: 2, amountCents: -3_000_000, label: 'Car; new' }],
        contributionSchedule: [
          { from: '2027-01', monthlyCents: 0 },
          { from: '2028-03', monthlyCents: 150_000 },
        ],
        planStartDate: '2026-11-01',
        housePurchaseYear: 5,
        isActive: true,
      }),
    })
    expect(scenario.status).toBe(201)
    const dataset = await loadDataset(world.env, WORLD_OWNER)
    expect(dataset.settings.milestones).toHaveLength(2)
    expect(dataset.goalScenarios.some((g) => g.lifeEvents.length === 1 && g.contributionSchedule.length === 2)).toBe(true)
    const rich: Source = { name: 'rich', env: world.env, sqlite, owner: WORLD_OWNER, repo: createD1ExpenseRepository(world.env), queries: { count: 0 }, dataset }
    const store = memoryBackupStore()
    pinClock('2020-01-15')

    await untilComplete(depsOf(rich, store))

    const restored = await restoredFrom(store, WORLD_OWNER)
    expect(settled(restored)).toEqual(settled(dataset))
  }, SLOW)
})

describe('a single-file snapshot, the format before chunked backups', () => {
  it.each(['written through the API', 'synthetic', 'adversarial'])(
    'still restores, for the %s ledger, to the dataset it holds',
    async (name) => {
      const source = sources.find((s) => s.name === name)!
      const store = memoryBackupStore({ [ownerBackupKey(source.owner, DAY)]: JSON.stringify(await loadDataset(source.env, source.owner)) })

      const restored = await restoredFrom(store, source.owner)

      expect(settled(restored)).toEqual(settled(source.dataset))
    },
    SLOW,
  )
})

describe('the work of one invocation is bounded', () => {
  // One budget that the rows bind and one that the calls bind, so that each limit is held to on its own.
  it.each([
    { enabled: true, maxOperations: 20, maxRows: 1_200 },
    { enabled: true, maxOperations: 12, maxRows: 1_000_000 },
  ])('by its calls to the database and the bucket together, and by the rows it reads: %o', async (budget) => {
    const source = sources.find((s) => s.name === 'awkward')!
    const store = memoryBackupStore()
    const deps = depsOf(source, store, { chunked: budget })
    const rowsRead: number[] = []
    const repo: ExpenseRepository = {
      ...source.repo,
      readExportChunk: async (owner, request) => {
        const chunk = await source.repo.readExportChunk(owner, request)
        rowsRead.push(chunk.rows.length)
        return chunk
      },
    }

    for (let i = 0; i < 400; i += 1) {
      store.resetCalls()
      rowsRead.length = 0
      const before = source.queries.count
      // What had been spent when each listing of the bucket was asked for: the first starts the invocation and the
      // second is the pruning that follows a finished day, which is not part of the backup's own budget.
      const spentAtList: number[] = []
      const watched = { ...store, list: (prefix?: string) => {
        spentAtList.push(source.queries.count - before + store.total())
        return store.list(prefix)
      } } as MemoryBackupStore
      const result = await runChunkedBackups({ ...deps, repo, store: watched }, clockOf(DAY))

      const spent = result.complete && spentAtList.length > 1 ? spentAtList[1]! : source.queries.count - before + store.total()
      expect(spent, `invocation ${i + 1}`).toBeLessThanOrEqual(budget.maxOperations)
      expect(rowsRead.reduce((a, b) => a + b, 0)).toBeLessThanOrEqual(budget.maxRows)
      if (result.complete) return
    }
    throw new Error('the backup did not finish')
  }, SLOW)

  it('whatever the budget, so that no phase of a run can overspend it', async () => {
    // Receipts come last, so a ledger with exactly a part's worth of them is one whose final read both ends the last
    // table and fills a part: the case in which writing the part and saving the state leaves the least for finishing.
    // With nothing else in the ledger, some budget leaves exactly the reserve for that read.
    const withReceipts = async (name: string, ledger: ExpenseDataset): Promise<Source> => {
      const source = await sourceOf(name, ledger)
      const attach = source.sqlite.prepare(
        `INSERT INTO transaction_attachments (owner,transaction_id,object_key,content_type,byte_size) VALUES (?,?,?,'image/jpeg',100)`,
      )
      for (let i = 0; i < SAVE_ROWS; i += 1) attach.run(source.owner, 1, `extra-receipts/${i}`)
      // A check-in makes reading the wealth tables cost the two queries it is budgeted for; an empty one costs one.
      source.sqlite.prepare("INSERT INTO wealth_accounts (id,owner,name,kind) VALUES (1,?,'Broker','investment')").run(source.owner)
      source.sqlite.prepare("INSERT INTO wealth_checkins (id,owner,checkin_date) VALUES (1,?,'2019-06-01')").run(source.owner)
      source.sqlite.prepare('INSERT INTO wealth_checkin_entries (checkin_id,account_id,value_cents) VALUES (1,1,5000)').run()
      return source
    }
    const ledgers = [
      await withReceipts('receipts', syntheticLedger({ months: 3, perMonth: 20, seed: 61 })),
      // An owner exists once they have a row in some table, so the ledger has a category and nothing else.
      await withReceipts('only receipts', makeDataset({ categories: [{ id: 1, name: 'Food', monthlyBudgetCents: 0, sortOrder: 0, active: true }] })),
    ]
    for (const source of ledgers) {
      for (const maxRows of [300, 1_500, 100_000]) {
        for (let maxOperations = 12; maxOperations <= 46; maxOperations += 1) {
          const store = memoryBackupStore()
          const deps = depsOf(source, store, { chunked: { enabled: true, maxOperations, maxRows } })
          for (let i = 0; i < 400; i += 1) {
            store.resetCalls()
            const before = source.queries.count
            const spentAtList: number[] = []
            const watched = { ...store, list: (prefix?: string) => {
              spentAtList.push(source.queries.count - before + store.total())
              return store.list(prefix)
            } } as MemoryBackupStore
            const result = await runChunkedBackups({ ...deps, store: watched }, clockOf(DAY))
            const spent = result.complete && spentAtList.length > 1 ? spentAtList[1]! : source.queries.count - before + store.total()
            expect(spent, `${source.name}: ${maxOperations} calls, ${maxRows} rows, invocation ${i + 1}`).toBeLessThanOrEqual(maxOperations)
            if (result.complete) break
          }
        }
      }
    }
  }, SLOW)

  it('and the default budget fits two owners with a small ledger each into one invocation', async () => {
    const sqlite = migratedDatabase()
    const world = createExpenseWorld(sqlite, sqliteD1(sqlite, newStats()))
    sqlite.exec('PRAGMA foreign_keys = OFF')
    const { seedDataset } = await import('../../src/testing/seedSqlite')
    const first = syntheticLedger({ months: 6, perMonth: 15, seed: 11 })
    seedDataset(sqlite, OWNER, first)
    seedDataset(sqlite, OTHER_OWNER, shifted(syntheticLedger({ months: 6, perMonth: 15, seed: 12 }), 1_000_000))
    const { d1, queries } = counted(world.env.DB)
    const env: Env = { DB: d1 }
    const repo = createD1ExpenseRepository(env)
    const store = memoryBackupStore()

    const result = await runChunkedBackups(
      { repo, store, alerts: alertsSpy(), policy, chunked: { enabled: true, maxOperations: 44, maxRows: 10_000 }, readRevision: async (o) => (await readOwnerRevision(d1, o)).token },
      clockOf(DAY),
    )

    expect(result.complete).toBe(true)
    expect(result.owners).toBe(2)
    expect(queries.count + store.total()).toBeLessThanOrEqual(44 + 3)
    expect(store.objects.has(manifestKey(OWNER, DAY))).toBe(true)
    expect(store.objects.has(manifestKey(OTHER_OWNER, DAY))).toBe(true)
  }, SLOW)

  it('and a finished day costs the next invocation one list of the bucket and one list of the owners', async () => {
    const store = memoryBackupStore()
    const deps = depsOf(written, store)
    await untilComplete(deps)
    store.resetCalls()
    const before = written.queries.count

    const result = await runChunkedBackups(deps, clockOf(DAY))

    expect(result.complete).toBe(true)
    expect(store.total()).toBe(1)
    expect(written.queries.count - before).toBe(1)
  })
})

describe('an invocation killed part way', () => {
  it('is carried on by the next one, wherever it was killed, and the backup still restores', async () => {
    const source = sources.find((s) => s.name === 'written through the API')!
    // Few rows an invocation, so that the run is many invocations and every kind of call is made several times.
    const small = { enabled: true, maxOperations: 12, maxRows: 4 }
    const reference = memoryBackupStore()
    const invocations = await untilComplete(depsOf(source, reference, { chunked: small }))
    const calls = reference.total()
    expect(invocations).toBeGreaterThan(4)
    expect(calls).toBeGreaterThan(25)

    // Die at each bucket call of the whole backup in turn, then let the invocations after it finish the job.
    for (let point = 0; point < calls; point += 1) {
      const store = memoryBackupStore()
      const deps = depsOf(source, store, { chunked: small })
      store.killAfter(point)
      let killed = false
      for (let i = 0; i < 400; i += 1) {
        // The one call whose failure is tolerated is the delete of the state file after the manifest is written.
        const outcome = await runChunkedBackups(deps, clockOf(DAY)).catch((error: Error) => error)
        if (outcome instanceof Error) {
          expect(outcome.message).toContain('killed')
          killed = true
          store.killAfter(null)
          continue
        }
        if (outcome.complete) break
      }
      store.killAfter(null)

      expect(killed || point >= calls - 1, `killed after ${point} calls`).toBe(true)
      expect(settled(await restoredFrom(store, source.owner)), `killed after ${point} calls`).toEqual(settled(source.dataset))
    }
  }, SLOW)

  it('and so is one that fills a part inside a single invocation, so the save after the part is held to its order', async () => {
    // The test above reads 4 rows an invocation, so it never reaches the save that `drain` makes once SAVE_ROWS have been
    // read. If that save came before the part that holds those rows, a kill between the two calls would leave a state
    // that counts up to SAVE_ROWS rows no part holds. The backup would still finish and write its manifest, so the day
    // would count as done, and only the restore would refuse it ("the manifest records N rows and the parts hold 0").
    const source = await sourceOf('fills a part', syntheticLedger({ months: 12, perMonth: 100, seed: 51 }))
    expect(source.dataset.transactions.length).toBeGreaterThan(2 * SAVE_ROWS)
    const reference = memoryBackupStore()
    await untilComplete(depsOf(source, reference))
    const calls = reference.total()

    for (let point = 0; point < calls; point += 1) {
      const store = memoryBackupStore()
      const deps = depsOf(source, store)
      store.killAfter(point)
      for (let i = 0; i < 400; i += 1) {
        const outcome = await runChunkedBackups(deps, clockOf(DAY)).catch((error: Error) => error)
        if (outcome instanceof Error) {
          store.killAfter(null)
          continue
        }
        if (outcome.complete) break
      }
      store.killAfter(null)
      expect(settled(await restoredFrom(store, source.owner)), `killed after ${point} calls`).toEqual(settled(source.dataset))
    }
  }, SLOW)

  it('and a state that cannot be read starts the run again over its own parts', async () => {
    const store = memoryBackupStore()
    const deps = depsOf(written, store, { chunked: { enabled: true, maxOperations: 14, maxRows: 30 } })
    await runChunkedBackups(deps, clockOf(DAY))
    expect(store.objects.has(stateKey(WORLD_OWNER, DAY))).toBe(true)
    store.objects.set(stateKey(WORLD_OWNER, DAY), '{ not json')

    await untilComplete(deps)

    expect(settled(await restoredFrom(store, WORLD_OWNER))).toEqual(settled(written.dataset))
  }, SLOW)

  it('and a state from another owner’s run is not trusted', async () => {
    const store = memoryBackupStore()
    const deps = depsOf(written, store, { chunked: { enabled: true, maxOperations: 14, maxRows: 30 } })
    await runChunkedBackups(deps, clockOf(DAY))
    const saved = JSON.parse(store.objects.get(stateKey(WORLD_OWNER, DAY))!) as { owner: string }
    store.objects.set(stateKey(WORLD_OWNER, DAY), JSON.stringify({ ...saved, owner: 'someone@example.com' }))

    await untilComplete(deps)

    expect(settled(await restoredFrom(store, WORLD_OWNER))).toEqual(settled(written.dataset))
  }, SLOW)
})

describe('a run that never finishes', () => {
  it('is reported once, on the next day, and not carried over', async () => {
    const store = memoryBackupStore()
    const alerts = alertsSpy()
    const small = { enabled: true, maxOperations: 14, maxRows: 30 }
    const deps = depsOf(written, store, { alerts, chunked: small })
    expect((await runChunkedBackups(deps, clockOf(DAY))).complete).toBe(false)

    const calls: number[] = []
    for (let i = 0; i < 400; i += 1) {
      const result = await runChunkedBackups(deps, clockOf(NEXT_DAY))
      calls.push(alerts.onIncompleteBackup.mock.calls.length)
      if (result.complete) break
    }

    expect(alerts.onIncompleteBackup).toHaveBeenCalledTimes(1)
    expect(alerts.onIncompleteBackup).toHaveBeenCalledWith({ owner: WORLD_OWNER, dateKey: DAY })
    expect(store.objects.has(stateKey(WORLD_OWNER, DAY))).toBe(false)
    expect(store.objects.has(manifestKey(WORLD_OWNER, DAY))).toBe(false)
    expect(store.objects.has(manifestKey(WORLD_OWNER, NEXT_DAY))).toBe(true)
    expect(calls.every((n) => n === 1)).toBe(true)
  }, SLOW)

  it('is not reported for a day that finished, though its state file was left behind', async () => {
    const store = memoryBackupStore()
    const alerts = alertsSpy()
    const deps = depsOf(written, store, { alerts })
    await untilComplete(deps)
    store.objects.set(stateKey(WORLD_OWNER, DAY), 'left behind when the delete failed')

    await runChunkedBackups(deps, clockOf(NEXT_DAY))

    expect(alerts.onIncompleteBackup).not.toHaveBeenCalled()
  })

  it('is not reported while the same day is still going, nor when it finished', async () => {
    const store = memoryBackupStore()
    const alerts = alertsSpy()
    const deps = depsOf(written, store, { alerts, chunked: { enabled: true, maxOperations: 14, maxRows: 30 } })

    await untilComplete(deps)
    await runChunkedBackups(deps, clockOf(NEXT_DAY))

    expect(alerts.onIncompleteBackup).not.toHaveBeenCalled()
  }, SLOW)
})

describe('the alerts the single-file backup raised are kept', () => {
  it('a finished backup over the snapshot size is reported with its owner, its size and the limit', async () => {
    const store = memoryBackupStore()
    const alerts = alertsSpy()
    await untilComplete(depsOf(written, store, { alerts, policy: { ...policy, maxSnapshotBytes: 2_000 } }))

    const manifest = parseBackupManifest(store.objects.get(manifestKey(WORLD_OWNER, DAY))!)
    expect(alerts.onLargeSnapshot).toHaveBeenCalledTimes(1)
    expect(alerts.onLargeSnapshot).toHaveBeenCalledWith({ owner: WORLD_OWNER, bytes: manifest.bytes, limit: 2_000 })
  })

  it('a backup under it is not', async () => {
    const alerts = alertsSpy()
    await untilComplete(depsOf(written, memoryBackupStore(), { alerts }))

    expect(alerts.onLargeSnapshot).not.toHaveBeenCalled()
  })

  it('the bucket is pruned and its size reported once the day is finished, folders whole', async () => {
    const store = memoryBackupStore({
      [`${WORLD_OWNER}/2026-09-01.json`]: 'x'.repeat(100),
      [`${WORLD_OWNER}/2026-09-02/part-000001.ndjson`]: 'y'.repeat(100),
      [`${WORLD_OWNER}/2026-09-02/manifest.json`]: '{}',
    })
    const alerts = alertsSpy()

    await untilComplete(depsOf(written, store, { alerts, policy: { ...policy, maxBucketBytes: 10_000_000, bucketAlertThresholdFraction: 0.00001 } }))

    expect([...store.objects.keys()].some((k) => k.includes('2026-09-0'))).toBe(false)
    expect(alerts.onBucketNearLimit).toHaveBeenCalledWith({ usedBytes: expect.any(Number), limitBytes: 10_000_000 })
  })
})

describe('a ledger written to while it is backed up', () => {
  /** A source of its own, so that a test can change it. */
  const moving = (seed: number) => sourceOf('moving', syntheticLedger({ months: 6, perMonth: 40, seed }))

  function addTransaction(source: Source): void {
    const { account_id: accountId, category_id: categoryId } = source.sqlite
      .prepare('SELECT account_id, category_id FROM transactions WHERE owner = ? LIMIT 1')
      .get(source.owner) as { account_id: number; category_id: number }
    source.sqlite
      .prepare(
        `INSERT INTO transactions (owner,date,budget_month,description,description_norm,account_id,category_id,type,amount_cents,cancelled)
         VALUES (?,'2019-12-30','2019-12','Written meanwhile','written meanwhile',?,?,'expense',777,0)`,
      )
      .run(source.owner, accountId, categoryId)
    source.sqlite.prepare("UPDATE owner_revision SET token = 'moved' WHERE owner = ?").run(source.owner)
  }

  it('is noticed when the run is carried on: the pass is thrown away, reported, and redone with the write in it', async () => {
    const source = await moving(31)
    const store = memoryBackupStore()
    const alerts = alertsSpy()
    let reads = 0
    const repo: ExpenseRepository = {
      ...source.repo,
      readExportChunk: (owner, request) => {
        reads += 1
        return source.repo.readExportChunk(owner, request)
      },
    }
    const deps = depsOf(source, store, { alerts, repo, chunked: { enabled: true, maxOperations: 14, maxRows: 100 } })
    expect((await runChunkedBackups(deps, clockOf(DAY))).complete).toBe(false)

    addTransaction(source)
    reads = 0
    await runChunkedBackups(deps, clockOf(DAY))
    // The invocation that finds the ledger has moved says so before it reads another row.
    expect(reads).toBe(0)
    expect(alerts.onInconsistentBackup).toHaveBeenCalledTimes(1)
    await untilComplete(deps)

    expect(alerts.onInconsistentBackup).toHaveBeenCalledTimes(1)
    expect(alerts.onInconsistentBackup).toHaveBeenCalledWith({ owner: source.owner, dateKey: DAY, attempt: 1, final: false })
    expect(parseBackupManifest(store.objects.get(manifestKey(source.owner, DAY))!).revision).toBe('moved')
    const now = await loadDataset(source.env, source.owner)
    expect(now.transactions.some((t) => t.description === 'Written meanwhile')).toBe(true)
    expect(settled(await restoredFrom(store, source.owner))).toEqual(settled(now))
  }, SLOW)

  it('is noticed at the very end, and the backup that is marked complete is the pass that followed', async () => {
    const source = await moving(32)
    const store = memoryBackupStore()
    const alerts = alertsSpy()
    // The revision read as the run starts, and the one read as it finishes, differ; every read after is steady.
    const readings = ['first', 'second']
    const readRevision = () => Promise.resolve(readings.shift() ?? 'second')
    const deps = depsOf(source, store, { alerts, readRevision })

    const first = await runChunkedBackups(deps, clockOf(DAY))

    expect(first.complete).toBe(false)
    expect(store.objects.has(manifestKey(source.owner, DAY))).toBe(false)
    await untilComplete(deps)
    expect(alerts.onInconsistentBackup).toHaveBeenCalledTimes(1)
    expect(parseBackupManifest(store.objects.get(manifestKey(source.owner, DAY))!).revision).toBe('second')
    expect(settled(await restoredFrom(store, source.owner))).toEqual(settled(source.dataset))
  }, SLOW)

  it('gives up for the day after a few passes, says so, and spends nothing more on that owner', async () => {
    const sqlite = migratedDatabase()
    sqlite.exec('PRAGMA foreign_keys = OFF')
    sqlite.exec('DELETE FROM settings')
    const { seedDataset } = await import('../../src/testing/seedSqlite')
    seedDataset(sqlite, OWNER, syntheticLedger({ months: 3, perMonth: 10, seed: 41 }))
    seedDataset(sqlite, OTHER_OWNER, shifted(syntheticLedger({ months: 3, perMonth: 10, seed: 42 }), 1_000_000))
    const env: Env = { DB: sqliteD1(sqlite) }
    const store = memoryBackupStore()
    const alerts = alertsSpy()
    let reads = 0
    const deps: ChunkedDeps = {
      repo: createD1ExpenseRepository(env),
      store,
      alerts,
      policy,
      chunked: resolveChunkedBackup({ BACKUP_MODE: 'chunked' }),
      // One owner's ledger moves every time it is looked at; the other's never does.
      readRevision: (owner) => Promise.resolve(owner === OWNER ? `moving-${(reads += 1)}` : 'steady'),
    }

    let last = await runChunkedBackups(deps, clockOf(DAY))
    for (let i = 0; i < 12 && last.failed === 0; i += 1) last = await runChunkedBackups(deps, clockOf(DAY))

    expect(last).toMatchObject({ failed: 1, complete: false, pruned: 0 })
    const finals = alerts.onInconsistentBackup.mock.calls.map(([d]) => d)
    expect(finals).toHaveLength(MAX_PASSES)
    expect(finals.map((d) => d.attempt)).toEqual(Array.from({ length: MAX_PASSES }, (_, i) => i + 1))
    expect(finals.map((d) => d.final)).toEqual([...Array(MAX_PASSES - 1).fill(false), true])
    expect(store.objects.has(manifestKey(OWNER, DAY))).toBe(false)
    expect(store.objects.has(manifestKey(OTHER_OWNER, DAY))).toBe(true)

    store.resetCalls()
    alerts.onInconsistentBackup.mockClear()
    const again = await runChunkedBackups(deps, clockOf(DAY))

    expect(again).toMatchObject({ failed: 1, complete: false })
    expect(alerts.onInconsistentBackup).not.toHaveBeenCalled()
    expect(store.calls.put).toBe(0)
  }, SLOW)

  it('never marks a spoiled pass complete: with the ledger moving, no manifest is written', async () => {
    const source = await moving(33)
    const store = memoryBackupStore()
    let reads = 0
    const deps = depsOf(source, store, { readRevision: () => Promise.resolve(`moving-${(reads += 1)}`) })

    for (let i = 0; i < 10; i += 1) await runChunkedBackups(deps, clockOf(DAY))

    expect([...store.objects.keys()].some((key) => key.endsWith('manifest.json'))).toBe(false)
  }, SLOW)
})

describe('how often the state is saved', () => {
  it('after every chunk of a big table, so a kill loses less than a chunk of work', async () => {
    const source = await sourceOf('big', syntheticLedger({ months: 24, perMonth: 100, seed: 51 }))
    const store = memoryBackupStore()
    const stateWrites: number[] = []
    const counting = { ...store, put: (key: string, text: string, type?: string) => {
      if (key === stateKey(source.owner, DAY)) stateWrites.push(text.length)
      return store.put(key, text, type)
    } }
    const deps = depsOf(source, counting as MemoryBackupStore, { chunked: { enabled: true, maxOperations: 46, maxRows: 100_000 } })

    await untilComplete(deps)

    const transactions = source.dataset.transactions.length
    expect(transactions).toBeGreaterThan(READ_ROWS * 4)
    expect(stateWrites.length).toBeGreaterThanOrEqual(Math.floor(transactions / READ_ROWS))
  }, SLOW)
})

describe('two owners in one database', () => {
  it('each get a folder of their own rows, and each restores to their own dataset', async () => {
    const sqlite = migratedDatabase()
    sqlite.exec('PRAGMA foreign_keys = OFF')
    const { seedDataset } = await import('../../src/testing/seedSqlite')
    seedDataset(sqlite, OWNER, syntheticLedger({ months: 6, perMonth: 20, seed: 21 }))
    seedDataset(sqlite, OTHER_OWNER, shifted(syntheticLedger({ months: 6, perMonth: 20, seed: 22 }), 1_000_000))
    const env: Env = { DB: sqliteD1(sqlite) }
    const repo = createD1ExpenseRepository(env)
    const a = await loadDataset(env, OWNER)
    const b = await loadDataset(env, OTHER_OWNER)
    const store = memoryBackupStore()

    await untilComplete({
      repo, store, alerts: alertsSpy(), policy, chunked: { enabled: true, maxOperations: 16, maxRows: 800 },
      readRevision: async (o) => (await readOwnerRevision(env.DB, o)).token,
    })

    expect(settled(await restoredFrom(store, OWNER))).toEqual(settled(a))
    expect(settled(await restoredFrom(store, OTHER_OWNER))).toEqual(settled(b))
    const ids = (owner: string) => new Set([...store.objects].filter(([k]) => k.startsWith(`${owner}/`) && k.includes('/part-')).flatMap(([, body]) => body.split('\n').filter(Boolean).map((l) => (JSON.parse(l) as { t: string; r: { id?: number } }).r.id)))
    expect([...ids(OWNER)].some((id) => id !== undefined && ids(OTHER_OWNER).has(id))).toBe(false)
  }, SLOW)
})

describe('tables', () => {
  it('every table of the dataset is in a backup, and the manifest counts them', async () => {
    const store = memoryBackupStore()
    await untilComplete(depsOf(written, store))

    const manifest = parseBackupManifest(store.objects.get(manifestKey(WORLD_OWNER, DAY))!)

    for (const table of EXPORT_TABLES) {
      if (table !== 'settings') expect(manifest.tables[table], table).toBe((written.dataset[table] as unknown[]).length)
    }
    expect(manifest.tables.settings).toBe(1)
  })
})
