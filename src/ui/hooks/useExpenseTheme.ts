import { useEffect, useState } from 'react'

export type ExpenseTheme = 'system' | 'light' | 'dark'

const STORAGE_KEY = 'exp-theme'

function readStored(): ExpenseTheme {
  try {
    const v = localStorage.getItem(STORAGE_KEY)
    if (v === 'light' || v === 'dark' || v === 'system') return v
  } catch {
    /* private mode / blocked storage */
  }
  return 'system'
}

function apply(theme: ExpenseTheme) {
  const root = document.documentElement
  if (theme === 'system') root.removeAttribute('data-exp-theme')
  else root.setAttribute('data-exp-theme', theme)
}

/** Persisted light/dark override for the expense tracker (system = follow OS). */
export function useExpenseTheme(): [ExpenseTheme, (next: ExpenseTheme) => void] {
  const [theme, setTheme] = useState<ExpenseTheme>(() => {
    const stored = readStored()
    apply(stored)
    return stored
  })

  useEffect(() => {
    apply(theme)
    try {
      localStorage.setItem(STORAGE_KEY, theme)
    } catch {
      /* ignore */
    }
  }, [theme])

  return [theme, setTheme]
}
