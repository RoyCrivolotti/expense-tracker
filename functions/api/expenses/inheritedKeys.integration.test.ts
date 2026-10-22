// @vitest-environment node
/**
 * A partial update names the columns it sets by the keys of its body. A key that every object inherits
 * (`constructor`, `hasOwnProperty`) or that JSON can carry as an own key (`__proto__`) is not a column, and must be
 * treated as any other unknown key: left out, so that a body with nothing else in it is an empty patch (400) and one
 * with a real field still saves that field. It used to be taken for a column and ended as a 500.
 */
import type { DatabaseSync } from 'node:sqlite'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { migratedDatabase, newStats, sqliteD1 } from '../../../src/testing/sqliteD1'
import { createExpenseWorld, pinClock, type Handler, type World } from '../../_shared/testing/expenseWorld'
import { seedLedger, type SeededIds } from '../../_shared/testing/seedLedger'
import { onRequestPatch as patchAccount } from './accounts/[id]'
import { onRequestPatch as patchCategory } from './categories/[id]'
import { onRequestPatch as patchFlag } from './flags/[id]'
import { onRequestPatch as patchPlan } from './installment-plans/[id]'
import { onRequestPatch as patchLabel } from './labels/[id]'
import { onRequestPatch as patchScenario } from './scenarios/[id]'
import { onRequestPut as putSettings } from './settings/index'
import { onRequestPatch as patchWealthAccount } from './wealth-accounts/[id]'
import { onRequestPatch as patchCheckin } from './wealth-checkins/[id]'

let world: World
let sqlite: DatabaseSync
let ids: SeededIds

beforeEach(async () => {
  pinClock('2026-10-15')
  sqlite = migratedDatabase()
  world = createExpenseWorld(sqlite, sqliteD1(sqlite, newStats()))
  ids = await seedLedger(world)
})

afterEach(() => {
  vi.useRealTimers()
})

const JUNK: Array<[string, unknown]> = [
  ['__proto__', JSON.parse('{"__proto__": 1}')],
  ['__proto__ holding an object', JSON.parse('{"__proto__": {"name": "x"}}')],
  ['constructor', { constructor: 'x' }],
  ['hasOwnProperty', { hasOwnProperty: 1 }],
  ['toString', { toString: 'x' }],
]

interface Target {
  name: string
  handler: Handler
  method: string
  path: () => string
  params?: () => Record<string, string>
  /** A real field of the body, and the column and value to find when it was saved. */
  real: { body: Record<string, unknown>; table: string; where: () => string; column: string; value: unknown }
}

const TARGETS: Target[] = [
  { name: 'account', handler: patchAccount, method: 'PATCH', path: () => `/accounts/${ids.spareAccount}`, params: () => ({ id: String(ids.spareAccount) }), real: { body: { name: 'Renamed' }, table: 'accounts', where: () => `id = ${ids.spareAccount}`, column: 'name', value: 'Renamed' } },
  { name: 'category', handler: patchCategory, method: 'PATCH', path: () => `/categories/${ids.spareCategory}`, params: () => ({ id: String(ids.spareCategory) }), real: { body: { name: 'Renamed' }, table: 'categories', where: () => `id = ${ids.spareCategory}`, column: 'name', value: 'Renamed' } },
  { name: 'flag', handler: patchFlag, method: 'PATCH', path: () => `/flags/${ids.spareFlag}`, params: () => ({ id: String(ids.spareFlag) }), real: { body: { name: 'Renamed' }, table: 'flags', where: () => `id = ${ids.spareFlag}`, column: 'name', value: 'Renamed' } },
  { name: 'label', handler: patchLabel, method: 'PATCH', path: () => `/labels/${ids.spareLabel}`, params: () => ({ id: String(ids.spareLabel) }), real: { body: { name: 'Renamed' }, table: 'labels', where: () => `id = ${ids.spareLabel}`, column: 'name', value: 'Renamed' } },
  { name: 'installment plan', handler: patchPlan, method: 'PATCH', path: () => `/installment-plans/${ids.plan}`, params: () => ({ id: String(ids.plan) }), real: { body: { description: 'Renamed' }, table: 'installment_plans', where: () => `id = ${ids.plan}`, column: 'description', value: 'Renamed' } },
  { name: 'scenario', handler: patchScenario, method: 'PATCH', path: () => `/scenarios/${ids.spareScenario}`, params: () => ({ id: String(ids.spareScenario) }), real: { body: { name: 'Renamed' }, table: 'goal_scenarios', where: () => `id = ${ids.spareScenario}`, column: 'name', value: 'Renamed' } },
  { name: 'settings', handler: putSettings, method: 'PUT', path: () => '/settings', real: { body: { openingCashCents: 4_242 }, table: 'settings', where: () => `owner = 'alex@example.com'`, column: 'opening_cash_cents', value: 4_242 } },
]

describe.each(TARGETS)('a partial update of a $name', (target) => {
  const send = (body: unknown) =>
    world.call(target.handler, { method: target.method, path: target.path(), body, ...(target.params ? { params: target.params() } : {}) })

  it.each(JUNK)('with only %s in the body is a 400, not a 500', async (_label, body) => {
    const response = await send(body)

    expect(response.status).toBe(400)
  })

  it.each(JUNK)('with %s next to a real field saves the field and ignores the rest', async (_label, junk) => {
    const response = await send({ ...(junk as object), ...target.real.body })

    expect(response.status).toBe(200)
    const { table, where, column, value } = target.real
    expect((sqlite.prepare(`SELECT ${column} AS v FROM ${table} WHERE ${where()}`).get() as { v: unknown }).v).toBe(value)
  })
})

describe.each([
  ['wealth account', patchWealthAccount, () => ids.wealthAccount],
  ['wealth check-in', patchCheckin, () => ids.checkin],
] as const)('a partial update of a %s', (_name, handler, id) => {
  it.each(JUNK)('with %s in the body is not a 500', async (_label, body) => {
    const response = await world.call(handler, { method: 'PATCH', path: `/x/${id()}`, params: { id: String(id()) }, body })

    expect(response.status).toBeLessThan(500)
  })
})
