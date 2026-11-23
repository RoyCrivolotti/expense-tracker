import { normalizeMilestones, validateMilestones } from '../domain/engine/milestones'
import type { ExpenseReference } from '../domain/ports/expenseReference'
import { settingsPatchError } from '../domain/settingsChecks'
import type { ExpenseSettings } from '../domain/types'
import { RepoHttpError } from './repoHttpError'
import { createAccount, deleteAccount, updateAccount } from './inMemoryAccounts'
import { createCategory, deleteCategory, updateCategory } from './inMemoryCategories'
import { assertOwnedAccount } from './inMemoryGuards'
import { type InMemoryState, type Op, using } from './inMemoryStore'

/** The Goals tab's own settings, checked as the API checks them. */
export function assertGoalsSettings(patch: Partial<ExpenseSettings>): void {
  const error = settingsPatchError(patch)
  if (error) throw new RepoHttpError(400, error)
}

export const updateSettings: Op<'updateSettings'> = (
  state,
  owner,
  patch,
) => {
  const store = state.storeFor(owner)
  const keys = Object.keys(patch) as (keyof ExpenseSettings)[]
  if (keys.length === 0) throw new RepoHttpError(400, 'Empty patch')
  if (patch.defaultAccountId != null) assertOwnedAccount(store, patch.defaultAccountId)
  if (
    patch.budgetRolloverDay != null &&
    (!Number.isInteger(patch.budgetRolloverDay) || patch.budgetRolloverDay < 1 || patch.budgetRolloverDay > 28)
  ) {
    throw new RepoHttpError(400, 'budgetRolloverDay must be between 1 and 28')
  }
  if (patch.milestones !== undefined) {
    const error = validateMilestones(patch.milestones)
    if (error) throw new RepoHttpError(400, error)
    patch = { ...patch, milestones: normalizeMilestones(patch.milestones) }
  }
  assertGoalsSettings(patch)
  store.settings = { ...store.settings, ...patch }
  return Promise.resolve({ ...store.settings })
}

export function reference(state: InMemoryState): ExpenseReference {
  return {
    createCategory: using(state, createCategory),
    updateCategory: using(state, updateCategory),
    deleteCategory: using(state, deleteCategory),
    createAccount: using(state, createAccount),
    updateAccount: using(state, updateAccount),
    deleteAccount: using(state, deleteAccount),
    updateSettings: using(state, updateSettings),
  }
}
