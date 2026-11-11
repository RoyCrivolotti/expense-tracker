// @vitest-environment node
/** Making, listing and revoking a capture key leaves the dataset revision alone, so no cached ledger misses for it. */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { migratedDatabase, newStats, sqliteD1 } from '../../../src/testing/sqliteD1'
import { OWNER, createExpenseWorld, type Handler, type World } from '../../_shared/testing/expenseWorld'
import { invokeExpenseApiRoute } from '../../_shared/testing/invokeExpenseApiRoute'
import { createD1ExpenseRepository } from '../../_shared/adapters/d1ExpenseRepository'
import { onRequestPost as createLabel } from '../expenses/labels/index'
import { onRequestDelete as revoke } from './[id]'
import { onRequestGet as list, onRequestPost as create } from './index'

let world: World

beforeEach(() => {
  const sqlite = migratedDatabase()
  world = createExpenseWorld(sqlite, sqliteD1(sqlite, newStats()))
  vi.spyOn(console, 'warn').mockImplementation(() => undefined)
})

function call(handler: Handler, method: string, id?: string, body?: unknown): Promise<Response> {
  return invokeExpenseApiRoute({
    handler,
    repo: createD1ExpenseRepository(world.env),
    env: world.env,
    url: `https://expenses.test/api/capture-keys${id ? `/${id}` : ''}`,
    method,
    email: OWNER,
    ...(id ? { params: { id } } : {}),
    ...(body !== undefined ? { body } : {}),
  })
}

describe('the dataset revision', () => {
  const label = (name: string) =>
    world.call(createLabel, { method: 'POST', path: '/labels', body: { name, color: '#336699' } })

  it('does not move when a key is made, listed or revoked, though an ordinary write moves it', async () => {
    await label('first')
    const before = world.token()
    expect(before).not.toBeNull()

    const { keyId } = (await (await call(create, 'POST', undefined, {})).json()) as { keyId: string }
    await call(list, 'GET')
    await call(revoke, 'DELETE', keyId)
    expect(world.token()).toBe(before)

    await label('second')
    expect(world.token()).not.toBe(before)
  })
})
