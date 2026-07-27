import type { DeleteCategoryOptions, NewCategory } from '../data/dataSource'
import type { ExpenseRepository } from '../ports/expenseRepository'

export function validateCategoryName(name: string | undefined): string {
  const trimmed = name?.trim()
  if (!trimmed) throw new Error('Category name is required')
  return trimmed
}

export async function createCategory(
  repo: ExpenseRepository,
  owner: string,
  input: NewCategory,
) {
  return repo.createCategory(owner, { ...input, name: validateCategoryName(input.name) })
}

export async function patchCategory(
  repo: ExpenseRepository,
  owner: string,
  id: number,
  patch: Partial<NewCategory>,
) {
  const next = { ...patch }
  if (patch.name !== undefined) next.name = validateCategoryName(patch.name)
  return repo.updateCategory(owner, id, next)
}

export async function removeCategory(
  repo: ExpenseRepository,
  owner: string,
  id: number,
  options?: DeleteCategoryOptions,
) {
  if (!options?.createCategory) return repo.deleteCategory(owner, id, options)
  return repo.deleteCategory(owner, id, {
    ...options,
    createCategory: {
      ...options.createCategory,
      name: validateCategoryName(options.createCategory.name),
    },
  })
}
