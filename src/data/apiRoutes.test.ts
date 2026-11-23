import { afterEach, describe, expect, it, vi } from 'vitest'
import { apiDataSource } from './apiDataSource'
import type { ExpenseDataSource } from './dataSource'

type Call = (source: Required<ExpenseDataSource>) => Promise<unknown>

/** One call to each route, with the method and path it must reach, and the body it must send (undefined for none). */
const ROUTES: Array<[string, Call, string, string, unknown]> = [
  ['createTransaction', (s) => s.createTransaction({} as never), 'POST', '/transactions', {}],
  ['createTransactions', (s) => s.createTransactions([]), 'POST', '/transactions/bulk', { transactions: [] }],
  [
    'updateTransaction',
    (s) => s.updateTransaction(4, { description: 'a' }),
    'PATCH',
    '/transactions/4',
    { description: 'a' },
  ],
  ['deleteTransaction', (s) => s.deleteTransaction(4), 'DELETE', '/transactions/4', undefined],
  ['deleteTransactions', (s) => s.deleteTransactions([1, 2]), 'DELETE', '/transactions/bulk', { ids: [1, 2] }],
  [
    'updateTransactions',
    (s) => s.updateTransactions([1], { flagId: 2 }),
    'PATCH',
    '/transactions/bulk',
    { ids: [1], patch: { flagId: 2 } },
  ],
  [
    'setStatementPaid',
    (s) => s.setStatementPaid(3, '2026-01', true, '2026-02-01'),
    'PUT',
    '/statements',
    { accountId: 3, yearMonth: '2026-01', paid: true, paidOn: '2026-02-01' },
  ],
  [
    'setCashActual',
    (s) => s.setCashActual('2026-01', 500),
    'PUT',
    '/cash-actuals',
    { yearMonth: '2026-01', actualCashCents: 500 },
  ],
  ['deleteAttachment', (s) => s.deleteAttachment(8), 'DELETE', '/attachments/8', undefined],
  ['createFlag', (s) => s.createFlag({ name: 'f' } as never), 'POST', '/flags', { name: 'f' }],
  ['updateFlag', (s) => s.updateFlag(2, { name: 'g' }), 'PATCH', '/flags/2', { name: 'g' }],
  ['deleteFlag', (s) => s.deleteFlag(2), 'DELETE', '/flags/2', undefined],
  ['createLabel', (s) => s.createLabel({ name: 'l' } as never), 'POST', '/labels', { name: 'l' }],
  ['updateLabel', (s) => s.updateLabel(2, { name: 'm' }), 'PATCH', '/labels/2', { name: 'm' }],
  ['deleteLabel', (s) => s.deleteLabel(2), 'DELETE', '/labels/2', undefined],
  [
    'setTransactionLabels',
    (s) => s.setTransactionLabels(5, [1, 2]),
    'PUT',
    '/transactions/5/labels',
    { labelIds: [1, 2] },
  ],
  ['createCategory', (s) => s.createCategory({ name: 'c' } as never), 'POST', '/categories', { name: 'c' }],
  ['updateCategory', (s) => s.updateCategory(2, { name: 'd' }), 'PATCH', '/categories/2', { name: 'd' }],
  ['deleteCategory', (s) => s.deleteCategory(2, { reassignToId: 3 }), 'DELETE', '/categories/2', { reassignToId: 3 }],
  ['createAccount', (s) => s.createAccount({ name: 'a' } as never), 'POST', '/accounts', { name: 'a' }],
  ['updateAccount', (s) => s.updateAccount(2, { name: 'b' }), 'PATCH', '/accounts/2', { name: 'b' }],
  ['deleteAccount', (s) => s.deleteAccount(2), 'DELETE', '/accounts/2', {}],
  ['updateSettings', (s) => s.updateSettings({ claimantName: 'x' }), 'PUT', '/settings', { claimantName: 'x' }],
  ['createScenario', (s) => s.createScenario({ name: 's' } as never), 'POST', '/scenarios', { name: 's' }],
  ['updateScenario', (s) => s.updateScenario(2, { name: 't' }), 'PATCH', '/scenarios/2', { name: 't' }],
  ['activateScenario', (s) => s.activateScenario(2), 'PATCH', '/scenarios/2', { isActive: true }],
  ['deleteScenario', (s) => s.deleteScenario(2), 'DELETE', '/scenarios/2', undefined],
  [
    'createInstallmentPlan',
    (s) => s.createInstallmentPlan({ description: 'p' } as never),
    'POST',
    '/installment-plans',
    { description: 'p' },
  ],
  [
    'updateInstallmentPlan',
    (s) => s.updateInstallmentPlan(2, { active: false }),
    'PATCH',
    '/installment-plans/2',
    { active: false },
  ],
  ['deleteInstallmentPlan', (s) => s.deleteInstallmentPlan(2), 'DELETE', '/installment-plans/2', undefined],
  [
    'createWealthAccount',
    (s) => s.createWealthAccount({ name: 'w' } as never),
    'POST',
    '/wealth-accounts',
    { name: 'w' },
  ],
  ['updateWealthAccount', (s) => s.updateWealthAccount(2, { name: 'v' }), 'PATCH', '/wealth-accounts/2', { name: 'v' }],
  [
    'createWealthCheckin',
    (s) => s.createWealthCheckin({ checkinDate: '2026-01-01', entries: [] }),
    'POST',
    '/wealth-checkins',
    { checkinDate: '2026-01-01', entries: [] },
  ],
  ['updateWealthCheckin', (s) => s.updateWealthCheckin(2, { note: 'n' }), 'PATCH', '/wealth-checkins/2', { note: 'n' }],
  ['deleteWealthCheckin', (s) => s.deleteWealthCheckin(2), 'DELETE', '/wealth-checkins/2', undefined],
]

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('apiDataSource routes', () => {
  it.each(ROUTES)(
    '%s reaches its route with the method and body the API expects',
    async (_name, call, method, path, body) => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers(),
        json: () => Promise.resolve({}),
      })
      vi.stubGlobal('fetch', fetchMock)

      await call(apiDataSource as Required<ExpenseDataSource>)

      const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
      expect(url).toBe(`/api/expenses${path}`)
      expect(init.method).toBe(method)
      expect(init.body === undefined ? undefined : JSON.parse(init.body as string)).toEqual(body)
    },
  )

  it('reports a wealth account delete as archived when the route does not say which', async () => {
    const answer = (json: unknown) =>
      vi.fn().mockResolvedValue({ ok: true, status: 200, headers: new Headers(), json: () => Promise.resolve(json) })
    vi.stubGlobal('fetch', answer({}))
    await expect(apiDataSource.deleteWealthAccount!(2)).resolves.toEqual({ archived: true })
    vi.stubGlobal('fetch', answer({ archived: false }))
    await expect(apiDataSource.deleteWealthAccount!(2)).resolves.toEqual({ archived: false })
  })
})
