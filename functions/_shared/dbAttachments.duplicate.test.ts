import { beforeEach, describe, expect, it } from 'vitest'
import type { DatabaseSync } from 'node:sqlite'
import { migratedDatabase, sqliteD1 } from '../../src/testing/sqliteD1'
import { createAttachment, listAttachments } from './dbAttachments'
import type { Env } from './env'

/**
 * A receipt's key is made from the bytes, so the same photo added to the same transaction twice has the same key
 * (receiptKeys.ts), and `object_key` is unique. The route has to answer with the receipt it already stored.
 */

const OWNER = 'owner@example.com'

let db: DatabaseSync
let env: Env

beforeEach(() => {
  db = migratedDatabase()
  db.prepare("INSERT INTO accounts (owner,id,name,kind,settlement,active) VALUES (?,1,'Main','debit','immediate',1)").run(OWNER)
  db.prepare("INSERT INTO categories (owner,id,name,monthly_budget_cents,sort_order,active) VALUES (?,1,'Food',0,0,1)").run(OWNER)
  db.prepare(
    `INSERT INTO transactions (owner,id,date,budget_month,description,account_id,category_id,type,amount_cents,cancelled)
     VALUES (?,7,'2026-09-10','2026-09','Lunch',1,1,'expense',1000,0)`,
  ).run(OWNER)
  env = { DB: sqliteD1(db) as unknown as D1Database } as Env
})

const photo = (objectKey: string) => ({
  transactionId: 7,
  objectKey,
  thumbKey: `${objectKey}_thumb`,
  contentType: 'image/jpeg',
  byteSize: 1200,
  originalName: 'lunch.jpg',
})

describe('createAttachment with a key that is already stored', () => {
  it('answers with the receipt that is there and adds no second row', async () => {
    const first = await createAttachment(env, OWNER, photo('owner@example.com/7/abc.jpg'))

    const again = await createAttachment(env, OWNER, photo('owner@example.com/7/abc.jpg'))

    expect(again).toEqual(first)
    expect(await listAttachments(env, OWNER, 7)).toHaveLength(1)
  })

  it('still adds a receipt whose bytes, and so whose key, are different', async () => {
    await createAttachment(env, OWNER, photo('owner@example.com/7/abc.jpg'))

    await createAttachment(env, OWNER, photo('owner@example.com/7/def.jpg'))

    expect(await listAttachments(env, OWNER, 7)).toHaveLength(2)
  })
})
