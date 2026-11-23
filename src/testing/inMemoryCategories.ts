import type { DeleteCategoryOptions, DeleteCategoryResult, NewCategory } from '../domain/data/dataSource'
import type { Category } from '../domain/types'
import { RepoHttpError } from './repoHttpError'
import { assertOwnedCategory } from './inMemoryGuards'
import { nextId, type Op, type OwnerStore } from './inMemoryStore'

export function createCategoryInStore(
  store: OwnerStore,
  input: NewCategory,
): Category {
  const category: Category = {
    id: nextId(store.categories),
    name: input.name,
    monthlyBudgetCents: input.monthlyBudgetCents,
    sortOrder: input.sortOrder,
    active: input.active,
    ...(input.icon !== undefined ? { icon: input.icon } : {}),
    ...(input.color !== undefined ? { color: input.color } : {}),
  }
  store.categories.push(category)
  return category
}

export function countCategoryUsage(
  store: OwnerStore,
  id: number,
): number {
  const txns = store.transactions.filter((t) => t.categoryId === id).length
  const plans = store.installmentPlans.filter((p) => p.categoryId === id).length
  return txns + plans
}

export function deleteCategoryInStore(
  store: OwnerStore,
  id: number,
  options?: DeleteCategoryOptions,
): DeleteCategoryResult {
  const { reassignToId, createCategory: createInput } = options ?? {}
  if (reassignToId != null && createInput) {
    throw new RepoHttpError(400, 'Specify either reassignToId or createCategory, not both')
  }

  if (reassignToId == null && !createInput) {
    const usage = countCategoryUsage(store, id)
    if (usage > 0) throw new RepoHttpError(409, `Category is in use by ${usage} record(s)`)
    const index = store.categories.findIndex((c) => c.id === id)
    if (index < 0) throw new RepoHttpError(404, 'Category not found')
    store.categories.splice(index, 1)
    return { reassignedToId: null }
  }

  let targetId: number
  let createdCategory: Category | undefined
  if (createInput) {
    createdCategory = createCategoryInStore(store, createInput)
    targetId = createdCategory.id
  } else {
    if (reassignToId === id) throw new RepoHttpError(400, 'Cannot reassign a category to itself')
    targetId = assertOwnedCategory(store, reassignToId!).id
  }

  const index = store.categories.findIndex((c) => c.id === id)
  if (index < 0) throw new RepoHttpError(404, 'Category not found')
  store.categories.splice(index, 1)
  store.transactions = store.transactions.map((t) => (t.categoryId === id ? { ...t, categoryId: targetId } : t))
  store.installmentPlans = store.installmentPlans.map((p) => (p.categoryId === id ? { ...p, categoryId: targetId } : p))
  return { reassignedToId: targetId, ...(createdCategory ? { createdCategory } : {}) }
}

export const createCategory: Op<'createCategory'> = (
  state,
  owner,
  input,
) => {
  const store = state.storeFor(owner)
  return Promise.resolve({ ...createCategoryInStore(store, input) })
}

export const updateCategory: Op<'updateCategory'> = (
  state,
  owner,
  id,
  patch,
) => {
  const store = state.storeFor(owner)
  const index = store.categories.findIndex((c) => c.id === id)
  if (index < 0) throw new RepoHttpError(404, 'Category not found')
  const keys = Object.keys(patch) as (keyof NewCategory)[]
  if (keys.length === 0) throw new RepoHttpError(400, 'Empty patch')
  const updated = { ...store.categories[index]!, ...patch, id }
  store.categories[index] = updated
  return Promise.resolve({ ...updated })
}

export const deleteCategory: Op<'deleteCategory'> = (
  state,
  owner,
  id,
  options,
) => {
  const store = state.storeFor(owner)
  return Promise.resolve(deleteCategoryInStore(store, id, options))
}
