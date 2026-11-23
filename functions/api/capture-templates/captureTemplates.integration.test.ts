// @vitest-environment node
/**
 * The ignored-templates list and the un-ignore route, through the real middleware and migrations: a person sees and
 * changes only their own templates, the list holds masked words and never a push, and an un-ignored shape is
 * suggested again from its next push.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { migratedDatabase, newStats, sqliteD1 } from '../../../src/testing/sqliteD1'
import { OTHER, OWNER, createExpenseWorld, type Handler, type World } from '../../_shared/testing/expenseWorld'
import { invokeExpenseApiRoute } from '../../_shared/testing/invokeExpenseApiRoute'
import { createD1ExpenseRepository } from '../../_shared/adapters/d1ExpenseRepository'
import { capturePhone } from '../../_shared/testing/capturePhone'
import { MAX_IGNORED_LISTED } from '../../../src/domain/ports/captureTemplates'
import { onRequestPost as createLabel } from '../expenses/labels/index'
import { onRequestPost as dismiss } from '../recommendations/[id]/dismiss'
import { onRequestGet as list } from './index'
import { onRequestPost as unignore } from './[id]/unignore'

const NOW = new Date('2026-11-03T08:45:00.000Z')
const BASE = 'https://expenses.test/api/capture-templates'
const idOf = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const PUSH = (merchant: string) => `Has pagado 12,50 EUR en ${merchant} con tu tarjeta *4321`

let world: World
let sqlite: ReturnType<typeof migratedDatabase>

beforeEach(() => {
  sqlite = migratedDatabase()
  world = createExpenseWorld(sqlite, sqliteD1(sqlite, newStats()))
  vi.spyOn(console, 'warn').mockImplementation(() => undefined)
})

function call(
  handler: Handler,
  o: { id?: string; query?: string; email?: string } = {},
) {
  return invokeExpenseApiRoute({
    handler,
    repo: createD1ExpenseRepository(world.env),
    env: world.env,
    url: `${BASE}${o.id === undefined ? '' : `/${o.id}/unignore`}${o.query ?? ''}`,
    method: handler === list ? 'GET' : 'POST',
    email: o.email ?? OWNER,
    ...(o.id === undefined ? {} : { params: { id: o.id } }),
  })
}

function template(
  n: number,
  over: { owner?: string; ignoredAt?: string | null; skeleton?: string } = {},
) {
  sqlite
    .prepare(
      `INSERT INTO capture_templates (owner, template_id, source, title, skeleton, seen, dismissals, dismiss_streak, first_seen, last_seen, ignored_at)
       VALUES (?, ?, 'iberia', 'compra realizada', ?, 4, 3, 3, '2026-11-01', '2026-11-02', ?)`,
    )
    .run(
      over.owner ?? OWNER,
      idOf(n),
      over.skeleton ?? `compra realizada <N> <C> en <M> ${n}`,
      over.ignoredAt === undefined ? `2026-11-02T10:00:${String(n % 60).padStart(2, '0')}.000Z` : over.ignoredAt,
    )
}

type Listed = {
  templates: Array<{
    templateId: string
    source: string
    skeleton: string
    seen: number
    dismissals: number
    ignoredAt: string
  }>
}
const listed = async (email = OWNER) =>
  (await (await call(list, { query: '?ignored=1', email })).json<Listed>()).templates
const ignoredAt = (n: number) =>
  sqlite.prepare('SELECT ignored_at, dismiss_streak FROM capture_templates WHERE template_id = ?').get(idOf(n)) as {
    ignored_at: string | null
    dismiss_streak: number
  }

describe('GET /api/capture-templates?ignored=1', () => {
  it('lists the person’s ignored templates, newest ignore first, by their masked words', async () => {
    template(1)
    template(2)
    template(3, { ignoredAt: null })
    template(4, { owner: OTHER })

    expect(await listed()).toEqual([
      {
        templateId: idOf(2),
        source: 'iberia',
        skeleton: 'compra realizada <N> <C> en <M> 2',
        seen: 4,
        dismissals: 3,
        ignoredAt: '2026-11-02T10:00:02.000Z',
      },
      {
        templateId: idOf(1),
        source: 'iberia',
        skeleton: 'compra realizada <N> <C> en <M> 1',
        seen: 4,
        dismissals: 3,
        ignoredAt: '2026-11-02T10:00:01.000Z',
      },
    ])
    expect((await listed(OTHER)).map((t) => t.templateId)).toEqual([idOf(4)])
  })

  it(`returns at most ${MAX_IGNORED_LISTED}`, async () => {
    for (let n = 1; n <= MAX_IGNORED_LISTED + 1; n++) template(n)
    expect(await listed()).toHaveLength(MAX_IGNORED_LISTED)
  })

  it.each(['', '?ignored=0', '?ignored=true', '?all=1'])(
    'refuses %s with a 400, since only the ignored list exists',
    async (query) => {
      expect((await call(list, { query })).status).toBe(400)
    },
  )
})

describe('POST /api/capture-templates/:id/unignore', () => {
  it('clears the ignore and the dismissal streak', async () => {
    template(1)
    const response = await call(unignore, { id: idOf(1) })

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ ok: true })
    expect(ignoredAt(1)).toEqual({ ignored_at: null, dismiss_streak: 0 })
    expect(await listed()).toEqual([])
  })

  it('answers ok for a template that is not ignored', async () => {
    template(1, { ignoredAt: null })
    expect((await call(unignore, { id: idOf(1) })).status).toBe(200)
  })

  it('is a 404 for another person’s template, which it leaves alone, and for an id that is none', async () => {
    template(1, { owner: OTHER })

    expect((await call(unignore, { id: idOf(1) })).status).toBe(404)
    expect(ignoredAt(1).ignored_at).not.toBeNull()
    expect((await call(unignore, { id: idOf(2) })).status).toBe(404)
  })

  it('answers 404 to an id that cannot be a template without reading any', async () => {
    world.clearLog()
    expect((await call(unignore, { id: "x' OR 1=1 --" })).status).toBe(404)
    expect(world.log.filter((sql) => /capture_templates/.test(sql))).toEqual([])
  })

  it('makes the next push of that shape a recommendation again', async () => {
    const phone = await capturePhone(world.env.DB, OWNER, NOW)
    for (const merchant of ['Offer One', 'Offer Two', 'Offer Three']) {
      const id = (await phone.push(PUSH(merchant)))!
      await world.call(dismiss, { method: 'POST', path: `/../recommendations/${id}/dismiss`, params: { id }, body: {} })
    }
    const [muted] = await listed()
    expect(await phone.push(PUSH('Offer Four'))).toBeNull()

    expect((await call(unignore, { id: muted!.templateId })).status).toBe(200)
    expect(await phone.push(PUSH('Offer Five'))).toEqual(expect.any(String))
  })

  it('leaves the dataset revision alone, though an ordinary write moves it', async () => {
    template(1)
    const label = (name: string) =>
      world.call(createLabel, { method: 'POST', path: '/labels', body: { name, color: '#336699' } })
    await label('first')
    const before = world.token()

    await call(unignore, { id: idOf(1) })
    await call(list, { query: '?ignored=1' })
    expect(world.token()).toBe(before)

    await label('second')
    expect(world.token()).not.toBe(before)
  })
})
