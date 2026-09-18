import { useEffect, useState } from 'react'

const STORAGE_KEY = 'exp-txn-collapsed-dates'

function readStored(): Set<string> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    const parsed: unknown = raw ? JSON.parse(raw) : []
    if (Array.isArray(parsed)) return new Set(parsed.filter((v): v is string => typeof v === 'string'))
  } catch {
    /* private mode / blocked storage / malformed JSON */
  }
  return new Set()
}

/** Persisted set of collapsed date keys in the Transactions list (dates start expanded). */
export function useCollapsedDateGroups(): [ReadonlySet<string>, (date: string) => void] {
  const [collapsed, setCollapsed] = useState<Set<string>>(readStored)

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify([...collapsed]))
    } catch {
      /* ignore */
    }
  }, [collapsed])

  const toggle = (date: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (next.has(date)) next.delete(date)
      else next.add(date)
      return next
    })
  }

  return [collapsed, toggle]
}
