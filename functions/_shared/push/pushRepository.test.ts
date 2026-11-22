import { beforeEach, describe, expect, it } from 'vitest'
import {
  MAX_PUSH_DEVICES,
  type NewPushSubscription,
  type PushRepository,
} from '../../../src/domain/ports/pushRepository'
import { migratedDatabase, sqliteD1 } from '../../../src/testing/sqliteD1'
import { createD1PushRepository } from '../adapters/d1PushRepository'

const ALICE = 'alice@example.com'
const BOB = 'bob@example.com'
const T0 = '2026-11-18T20:00:00.000Z'

let repo: PushRepository

beforeEach(() => {
  repo = createD1PushRepository({ DB: sqliteD1(migratedDatabase()) })
})

const sub = (over: Partial<NewPushSubscription> = {}): NewPushSubscription => ({
  id: 'id-1',
  owner: ALICE,
  endpoint: 'https://web.push.apple.com/one',
  p256dh: `B${'A'.repeat(86)}`,
  auth: 'a'.repeat(22),
  label: 'iPhone',
  createdAt: T0,
  ...over,
})

describe('a device’s subscription', () => {
  it('is stored once per endpoint: saving it again keeps the id and takes the new label and keys', async () => {
    expect(await repo.saveSubscription(sub())).toBe('id-1')
    expect(await repo.saveSubscription(sub({ id: 'id-2', label: 'My iPhone', auth: 'b'.repeat(22) }))).toBe('id-1')
    expect(await repo.listDevices(ALICE)).toEqual([
      { id: 'id-1', label: 'My iPhone', createdAt: T0, lastSentAt: null, lastStatus: null },
    ])
  })

  it('moves to whoever is signed in on the device', async () => {
    await repo.saveSubscription(sub())
    expect(await repo.saveSubscription(sub({ id: 'id-2', owner: BOB }))).toBe('id-1')
    expect(await repo.listDevices(ALICE)).toEqual([])
    expect((await repo.listDevices(BOB)).map((d) => d.id)).toEqual(['id-1'])
  })

  it('is capped per person inside the insert, and a refresh never counts against the cap', async () => {
    for (let i = 0; i < MAX_PUSH_DEVICES; i++) {
      expect(await repo.saveSubscription(sub({ id: `id-${i}`, endpoint: `https://web.push.apple.com/${i}` }))).toBe(
        `id-${i}`,
      )
    }
    expect(await repo.saveSubscription(sub({ id: 'id-x', endpoint: 'https://web.push.apple.com/x' }))).toBeNull()
    expect(
      await repo.saveSubscription(sub({ id: 'id-y', endpoint: 'https://web.push.apple.com/3', label: 'Again' })),
    ).toBe('id-3')
    expect(await repo.saveSubscription(sub({ id: 'id-b', owner: BOB, endpoint: 'https://web.push.apple.com/b' }))).toBe(
      'id-b',
    )
    expect(await repo.listDevices(ALICE)).toHaveLength(MAX_PUSH_DEVICES)
  })

  it('is deleted by its owner alone', async () => {
    await repo.saveSubscription(sub())
    expect(await repo.deleteSubscription(BOB, 'id-1')).toBe(false)
    expect(await repo.deleteSubscription(ALICE, 'id-1')).toBe(true)
    expect(await repo.deleteSubscription(ALICE, 'id-1')).toBe(false)
    expect(await repo.listDevices(ALICE)).toEqual([])
  })

  it('lists newest first', async () => {
    await repo.saveSubscription(
      sub({ id: 'old', endpoint: 'https://web.push.apple.com/old', createdAt: '2026-11-01T00:00:00.000Z' }),
    )
    await repo.saveSubscription(
      sub({ id: 'new', endpoint: 'https://web.push.apple.com/new', createdAt: '2026-11-02T00:00:00.000Z' }),
    )
    expect((await repo.listDevices(ALICE)).map((d) => d.id)).toEqual(['new', 'old'])
  })
})

describe('what a send needs', () => {
  it('lists the person’s own devices with their keys, oldest first', async () => {
    await repo.saveSubscription(
      sub({ id: 'b', endpoint: 'https://web.push.apple.com/b', createdAt: '2026-11-02T00:00:00.000Z' }),
    )
    await repo.saveSubscription(
      sub({ id: 'a', endpoint: 'https://web.push.apple.com/a', createdAt: '2026-11-01T00:00:00.000Z' }),
    )
    await repo.saveSubscription(sub({ id: 'c', owner: BOB, endpoint: 'https://web.push.apple.com/c' }))
    const targets = await repo.listTargets(ALICE)
    expect(targets.map((t) => t.id)).toEqual(['a', 'b'])
    expect(targets[0]).toEqual({
      id: 'a',
      endpoint: 'https://web.push.apple.com/a',
      p256dh: sub().p256dh,
      auth: sub().auth,
    })
  })

  it('notes the push service’s answer on the person’s own device only', async () => {
    await repo.saveSubscription(sub())
    await repo.recordSend(BOB, 'id-1', 500, T0)
    expect((await repo.listDevices(ALICE))[0]).toMatchObject({ lastSentAt: null, lastStatus: null })
    await repo.recordSend(ALICE, 'id-1', 201, T0)
    expect((await repo.listDevices(ALICE))[0]).toMatchObject({ lastSentAt: T0, lastStatus: 201 })
  })
})

describe('a person’s choice', () => {
  it('is absent until written, the default is kept out of the way of a choice already made, and a choice replaces it', async () => {
    expect(await repo.getSettings(ALICE)).toBeNull()
    await repo.saveSettings(ALICE, { mode: 'daily', timeZone: 'Europe/Madrid' }, true)
    expect(await repo.getSettings(ALICE)).toEqual({ mode: 'daily', timeZone: 'Europe/Madrid', lastSummaryAt: null })
    await repo.saveSettings(ALICE, { mode: 'each', timeZone: 'UTC' }, true)
    expect(await repo.getSettings(ALICE)).toMatchObject({ mode: 'daily', timeZone: 'Europe/Madrid' })
    await repo.saveSettings(ALICE, { mode: 'weekly', timeZone: 'America/New_York' }, false)
    expect(await repo.getSettings(ALICE)).toMatchObject({ mode: 'weekly', timeZone: 'America/New_York' })
    expect(await repo.getSettings(BOB)).toBeNull()
  })
})

describe('the summary cron’s reads and its claim', () => {
  it('lists the people who chose a summary, across owners, and not those who chose a push per payment', async () => {
    await repo.saveSettings(ALICE, { mode: 'daily', timeZone: 'Europe/Madrid' }, false)
    await repo.saveSettings(BOB, { mode: 'each', timeZone: 'UTC' }, false)
    await repo.saveSettings('carol@example.com', { mode: 'weekly', timeZone: 'Asia/Kolkata' }, false)
    expect(await repo.listSummaryPeople()).toEqual([
      { owner: ALICE, mode: 'daily', timeZone: 'Europe/Madrid', lastSummaryAt: null },
      { owner: 'carol@example.com', mode: 'weekly', timeZone: 'Asia/Kolkata', lastSummaryAt: null },
    ])
  })

  it('lets exactly one claim win, whether the person was never sent one or was sent one before', async () => {
    await repo.saveSettings(ALICE, { mode: 'daily', timeZone: 'Europe/Madrid' }, false)
    expect(await repo.claimSummary(ALICE, null, T0)).toBe(true)
    expect(await repo.claimSummary(ALICE, null, T0)).toBe(false)
    expect((await repo.listSummaryPeople())[0]?.lastSummaryAt).toBe(T0)
    const next = '2026-11-19T20:00:00.000Z'
    expect(await repo.claimSummary(ALICE, T0, next)).toBe(true)
    expect(await repo.claimSummary(ALICE, T0, next)).toBe(false)
    expect((await repo.getSettings(ALICE))?.lastSummaryAt).toBe(next)
  })

  it('claims nothing for a person who left the summaries or has no choice', async () => {
    await repo.saveSettings(ALICE, { mode: 'each', timeZone: 'Europe/Madrid' }, false)
    expect(await repo.claimSummary(ALICE, null, T0)).toBe(false)
    expect(await repo.claimSummary(BOB, null, T0)).toBe(false)
  })
})
