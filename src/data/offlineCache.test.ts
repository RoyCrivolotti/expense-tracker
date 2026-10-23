import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { defaultExpenseSettings } from '../engine'
import { installFakeIndexedDb } from '../testing/fakeIndexedDb'
import type { ExpenseDataset } from '../types'
import { SNAPSHOT_VERSION, forgetOfflineSnapshot, isCompatibleSnapshot, loadOfflineSnapshot, saveOfflineSnapshot } from './offlineCache'

const OWNER = 'alice@example.com'

describe('isCompatibleSnapshot', () => {
  it('rejects a snapshot written before versioning existed', () => {
    // The real-world case: a user whose cached dataset predates `flags`, which
    // buildLookup would map over and throw on.
    expect(isCompatibleSnapshot({ owner: OWNER }, OWNER)).toBe(false)
  })

  it('rejects a snapshot from an older schema version', () => {
    expect(isCompatibleSnapshot({ version: 1, owner: OWNER }, OWNER)).toBe(false)
    // Version 2 predates `settings.assumedInflation`, which every projection now reads.
    expect(isCompatibleSnapshot({ version: 2, owner: OWNER }, OWNER)).toBe(false)
    // Version 3 predates `labels`, which buildLookup now maps over.
    expect(isCompatibleSnapshot({ version: 3, owner: OWNER }, OWNER)).toBe(false)
    // Version 4 predates `settings.goalLevers`, which the Goals page reads the length of.
    expect(isCompatibleSnapshot({ version: 4, owner: OWNER }, OWNER)).toBe(false)
    // Version 5 predates `GoalScenario.contributionSchedule`, which every projection reads.
    expect(isCompatibleSnapshot({ version: 5, owner: OWNER }, OWNER)).toBe(false)
    // Version 6 predates `GoalScenario.homeCarryRate`, which Rent vs buy and the editor's draft read.
    expect(isCompatibleSnapshot({ version: 6, owner: OWNER }, OWNER)).toBe(false)
    // Version 7 predates `GoalScenario.retirementYears`, which the drawdown chart and the editor's draft read.
    expect(isCompatibleSnapshot({ version: 7, owner: OWNER }, OWNER)).toBe(false)
    // Version 8 predates `settings.marketVolatility`, which the spread card and the Assumptions card read.
    expect(isCompatibleSnapshot({ version: 8, owner: OWNER }, OWNER)).toBe(false)
  })

  it('rejects a missing record', () => {
    expect(isCompatibleSnapshot(undefined, OWNER)).toBe(false)
  })

  it('accepts a snapshot written by this build', () => {
    expect(isCompatibleSnapshot({ version: 9, owner: OWNER }, OWNER)).toBe(true)
  })
})

describe('the owner of a snapshot', () => {
  it('has to be the one asking, and has to be there', () => {
    expect(isCompatibleSnapshot({ version: SNAPSHOT_VERSION, owner: OWNER }, OWNER)).toBe(true)
    expect(isCompatibleSnapshot({ version: SNAPSHOT_VERSION, owner: 'bob@example.com' }, OWNER)).toBe(false)
    expect(isCompatibleSnapshot({ version: SNAPSHOT_VERSION }, OWNER)).toBe(false)
  })
})

describe('the saved copy in the store', () => {
  const dataset = (): ExpenseDataset => ({
    flags: [],
    labels: [],
    attachments: [],
    categories: [],
    accounts: [],
    transactions: [],
    accountStatements: [],
    cashActuals: [],
    goalScenarios: [],
    installmentPlans: [],
    wealthAccounts: [],
    wealthCheckins: [],
    settings: defaultExpenseSettings(),
  })
  let fake: ReturnType<typeof installFakeIndexedDb>
  beforeEach(() => {
    fake = installFakeIndexedDb()
  })
  afterEach(() => fake.uninstall())

  it('comes back for its owner and for no one else, whose asking removes it', async () => {
    await saveOfflineSnapshot(OWNER, dataset())

    expect(await loadOfflineSnapshot(OWNER)).toMatchObject({ dataset: dataset() })
    expect(await loadOfflineSnapshot('bob@example.com')).toBeNull()
    expect(fake.stores.get('snapshots')?.has('latest')).toBe(false)
    expect(await loadOfflineSnapshot(OWNER)).toBeNull()
  })

  it('is removed on request, and asking to remove what is not there is no error', async () => {
    await saveOfflineSnapshot(OWNER, dataset())

    await forgetOfflineSnapshot()
    await forgetOfflineSnapshot()

    expect(await loadOfflineSnapshot(OWNER)).toBeNull()
  })

  it('is forgotten without an error when the store refuses', async () => {
    await saveOfflineSnapshot(OWNER, dataset())
    fake.failNext('delete')

    await expect(forgetOfflineSnapshot()).resolves.toBeUndefined()
  })
})
