import { beforeEach, describe, expect, it } from 'vitest'
import type { DatabaseSync } from 'node:sqlite'
import { createD1AccessRepository } from '../../../functions/_shared/adapters/d1AccessRepository'
import { createD1CaptureRepository } from '../../../functions/_shared/adapters/d1CaptureRepository'
import { mintCaptureKey } from '../../../src/domain/capture'
import type { MintedCaptureKey } from '../../../src/domain/capture'
import { isAnnounced } from '../../../src/domain/capture/reviewDates'
import { migratedDatabase, sqliteD1 } from '../../../src/testing/sqliteD1'
import type { CaptureEnv } from './env'
import { handleCapture } from './handle'

/*
 * The day a bank's message names is measured from the day the push arrived on the phone's own clock, which the phone
 * writes with its offset: Madrid is UTC+1 in winter and UTC+2 in summer. These send pushes through the Worker around
 * midnight and across both clock changes of 2027 and read back what it stored. Wordings and amounts are invented.
 */

const OWNER = 'robin@example.com'
let db: DatabaseSync
let env: CaptureEnv
let key: MintedCaptureKey

beforeEach(async () => {
  db = migratedDatabase()
  env = { DB: sqliteD1(db), OWNER_EMAIL: OWNER, CAPTURE_REPLAY_SECRET: 'replay-secret' }
  await createD1AccessRepository(env).grantAccess(OWNER, OWNER)
  key = await mintCaptureKey()
  await createD1CaptureRepository(env).createKey({
    keyId: key.keyId,
    owner: OWNER,
    label: 'Phone',
    secretHash: key.secretHash,
    createdAt: '2027-01-01T00:00:00.000Z',
  })
})

interface Stored {
  local_date: string
  occurred_at: string
  arrival: string
}

/** Sends a push written at `at` (wall time and offset), received a minute later, and reads back its payment. */
async function send(
  body: string,
  at: string,
): Promise<Stored> {
  const request = new Request('https://capture.example.test/capture', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${key.key}` },
    body: JSON.stringify({ source: 'mybank', title: 'Aviso', body, date: at }),
  })
  const response = await handleCapture(request, env, {
    captures: createD1CaptureRepository(env),
    access: createD1AccessRepository(env),
    now: () => new Date(Date.parse(at) + 60_000),
    log: () => {},
  })
  expect(response.status).toBe(200)
  return db
    .prepare(
      'SELECT r.local_date, r.occurred_at, e.local_date AS arrival FROM capture_events e JOIN recommendations r ON r.id = e.rec_id ORDER BY e.rowid DESC LIMIT 1',
    )
    .get() as unknown as Stored
}

describe('the day a message names, measured from the phone’s day', () => {
  it('counts 10 days ahead from a push five minutes after midnight, and refuses 11 from one five minutes before', async () => {
    const before = await send('Se cargará 18,40 EUR el 25/01/2027', '2027-01-14T23:55:00+01:00')
    const after = await send('Se cargará 18,41 EUR el 25/01/2027', '2027-01-15T00:05:00+01:00')
    expect(before).toEqual({
      local_date: '2027-01-14',
      occurred_at: '2027-01-14T23:55:00+01:00',
      arrival: '2027-01-14',
    })
    expect(after).toEqual({ local_date: '2027-01-25', occurred_at: '2027-01-15T00:05:00+01:00', arrival: '2027-01-15' })
    expect(isAnnounced(after.occurred_at, after.local_date)).toBe(true)
    expect(isAnnounced(before.occurred_at, before.local_date)).toBe(false)
  })

  it('takes the phone’s day when UTC is still on the day before', async () => {
    // 00:30 in summer time is 22:30 UTC on the 30th: 10 November is 10 days from the 31st and 11 from the 30th.
    const late = await send('Charge of 7,25 EUR on 10/11/2027', '2027-10-31T00:30:00+02:00')
    expect(late).toEqual({ local_date: '2027-11-10', occurred_at: '2027-10-31T00:30:00+02:00', arrival: '2027-10-31' })
  })

  it('names the next day across the spring change, on either side of the missing hour', async () => {
    const winter = await send('Se cargará 12,00 EUR el 29/03/2027', '2027-03-28T01:59:00+01:00')
    const summer = await send('Se cargará 12,01 EUR el 29/03/2027', '2027-03-28T03:01:00+02:00')
    for (const stored of [winter, summer])
      expect(stored).toMatchObject({ local_date: '2027-03-29', arrival: '2027-03-28' })
  })

  it('names the next day across the autumn change, from both times the clock reads 02:30', async () => {
    const first = await send('Se cargará 30,00 EUR el 1 de noviembre', '2027-10-31T02:30:00+02:00')
    const second = await send('Se cargará 30,01 EUR el 1 de noviembre', '2027-10-31T02:30:00+01:00')
    expect(first).toEqual({ local_date: '2027-11-01', occurred_at: '2027-10-31T02:30:00+02:00', arrival: '2027-10-31' })
    expect(second).toEqual({
      local_date: '2027-11-01',
      occurred_at: '2027-10-31T02:30:00+01:00',
      arrival: '2027-10-31',
    })
  })

  it('keeps the arrival day for a message announced for that same day, so it is not taken for an announcement', async () => {
    const same = await send('El 2027-05-10 se cargará 44,00 EUR', '2027-05-10T07:15:00+02:00')
    expect(same).toEqual({ local_date: '2027-05-10', occurred_at: '2027-05-10T07:15:00+02:00', arrival: '2027-05-10' })
    expect(isAnnounced(same.occurred_at, same.local_date)).toBe(false)
  })
})
