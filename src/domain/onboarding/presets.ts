export interface CategoryPreset {
  name: string
  icon: string
  defaultBudgetCents: number
}

/** Starter categories for the onboarding wizard (budgets in cents). */
export const CATEGORY_PRESETS: CategoryPreset[] = [
  { name: 'Groceries', icon: '🛒', defaultBudgetCents: 50_000 },
  { name: 'Dining out', icon: '🍽', defaultBudgetCents: 18_000 },
  { name: 'Transport', icon: '🚇', defaultBudgetCents: 12_000 },
  { name: 'Utilities', icon: '💡', defaultBudgetCents: 20_000 },
  { name: 'Entertainment', icon: '🎬', defaultBudgetCents: 9_000 },
  { name: 'Health', icon: '💊', defaultBudgetCents: 7_500 },
]
