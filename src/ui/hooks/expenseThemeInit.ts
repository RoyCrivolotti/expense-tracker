import type { ExpenseTheme } from './useExpenseTheme'

const STORAGE_KEY = 'exp-theme'

/** Apply before first paint to avoid a theme flash. */
export function initExpenseTheme(): ExpenseTheme {
  let theme: ExpenseTheme = 'system'
  try {
    const v = localStorage.getItem(STORAGE_KEY)
    if (v === 'light' || v === 'dark' || v === 'system') theme = v
  } catch {
    /* ignore */
  }
  const root = document.documentElement
  if (theme === 'system') root.removeAttribute('data-exp-theme')
  else root.setAttribute('data-exp-theme', theme)
  return theme
}
