/**
 * The routes for goal scenarios, installment plans and the wealth accounts and check-ins, areas `apiDataSource` is
 * assembled from.
 */
import type { GoalScenario, InstallmentPlan, WealthAccount, WealthCheckin } from '../types'
import type { NewGoalScenario, NewInstallmentPlan, NewWealthAccount, NewWealthCheckin } from './dataSource'
import { req } from './apiClient'
import { BASE, type Routes } from './apiRoutes'

/** Goal scenarios and installment plans. */
export const planningRoutes: Routes<
  | 'createScenario'
  | 'updateScenario'
  | 'activateScenario'
  | 'deleteScenario'
  | 'createInstallmentPlan'
  | 'updateInstallmentPlan'
  | 'deleteInstallmentPlan'
> = {
  createScenario: (input: NewGoalScenario) =>
    req<GoalScenario>(`${BASE}/scenarios`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(input),
    }),
  updateScenario: (
    id: number,
    patch: Partial<NewGoalScenario>,
  ) =>
    req<GoalScenario>(`${BASE}/scenarios/${id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(patch),
    }),
  activateScenario: (id: number) =>
    req<GoalScenario>(`${BASE}/scenarios/${id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ isActive: true }),
    }),
  deleteScenario: async (id: number) => {
    await req(`${BASE}/scenarios/${id}`, { method: 'DELETE' })
  },
  createInstallmentPlan: (input: NewInstallmentPlan) =>
    req<InstallmentPlan>(`${BASE}/installment-plans`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(input),
    }),
  updateInstallmentPlan: (
    id: number,
    patch: Partial<NewInstallmentPlan>,
  ) =>
    req<InstallmentPlan>(`${BASE}/installment-plans/${id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(patch),
    }),
  deleteInstallmentPlan: async (id: number) => {
    await req(`${BASE}/installment-plans/${id}`, { method: 'DELETE' })
  },
}

/** Wealth accounts and check-ins. */
export const wealthRoutes: Routes<
  | 'createWealthAccount'
  | 'updateWealthAccount'
  | 'deleteWealthAccount'
  | 'createWealthCheckin'
  | 'updateWealthCheckin'
  | 'deleteWealthCheckin'
> = {
  createWealthAccount: (input: NewWealthAccount) =>
    req<WealthAccount>(`${BASE}/wealth-accounts`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(input),
    }),
  updateWealthAccount: (
    id: number,
    patch: Partial<NewWealthAccount>,
  ) =>
    req<WealthAccount>(`${BASE}/wealth-accounts/${id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(patch),
    }),
  // An answer from before the route said which keeps the assumption this client always made: archived.
  deleteWealthAccount: (id: number) =>
    req<{ archived?: boolean }>(`${BASE}/wealth-accounts/${id}`, { method: 'DELETE' }).then(({ archived }) => ({
      archived: archived ?? true,
    })),
  createWealthCheckin: (input: NewWealthCheckin) =>
    req<WealthCheckin>(`${BASE}/wealth-checkins`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(input),
    }),
  updateWealthCheckin: (
    id: number,
    patch: Partial<NewWealthCheckin>,
  ) =>
    req<WealthCheckin>(`${BASE}/wealth-checkins/${id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(patch),
    }),
  deleteWealthCheckin: async (id: number) => {
    await req(`${BASE}/wealth-checkins/${id}`, { method: 'DELETE' })
  },
}
