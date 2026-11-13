// @vitest-environment node
/** Linking, listing and removing a card leaves the dataset revision alone, so no cached ledger misses for it. */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { migratedDatabase, newStats, sqliteD1 } from '../../../src/testing/sqliteD1'
import { OWNER, createExpenseWorld, type Handler, type World } from '../../_shared/testing/expenseWorld'
import { invokeExpenseApiRoute } from '../../_shared/testing/invokeExpenseApiRoute'
import { createD1ExpenseRepository } from '../../_shared/adapters/d1ExpenseRepository'
import { onRequestPost as createLabel } from '../expenses/labels/index'
import { onRequestDelete as remove, onRequestGet as list, onRequestPost as link } from './index'

let world: World

beforeEach(() => {
  const sqlite = migratedDatabase()
  world = createExpenseWorld(sqlite, sqliteD1(sqlite, newStats()))
  sqlite.prepare("INSERT INTO accounts (id, owner, name, kind, settlement, active) VALUES (1, ?, 'Account', 'debit', 'immediate', 1)").run(OWNER)
  vi.spyOn(console, 'warn').mockImplementation(() => undefined)
})

function call(handler: Handler, method: string, body?: unknown): Promise<Response> {
  return invokeExpenseApiRoute({
    handler,
    repo: createD1ExpenseRepository(world.env),
    env: world.env,
    url: 'https://expenses.test/api/capture-cards',
    method,
    email: OWNER,
    ...(body !== undefined ? { body } : {}),
  })
}

describe('the dataset revision', () => {
  it('does not move when a card is linked, listed or removed, though an ordinary write moves it', async () => {
    const label = (name: string) => world.call(createLabel, { method: 'POST', path: '/labels', body: { name, color: '#336699' } })
    await label('first')
    const before = world.token()

    const body = { source: 'iberia', digits: '4821', accountId: 1 }
    expect((await call(link, 'POST', body)).status).toBe(200)
    await call(list, 'GET')
    expect((await call(remove, 'DELETE', body)).status).toBe(200)
    expect(world.token()).toBe(before)

    await label('second')
    expect(world.token()).not.toBe(before)
  })
})
