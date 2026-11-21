import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { isTipSeen, withTipSeen } from '../../domain/onboarding/tips'
import type { ExpenseSettings } from '../../types'
import { TipsContext, type Tips } from './tipsContext'

interface Props {
  /** The saved list: absent when never written (see `domain/onboarding/tips.ts`). */
  saved: readonly string[] | undefined
  hasTransactions: boolean
  /** Absent when the session cannot write (read-only, offline, the demo): no tip is shown then, as none could be acted on. */
  save: ((patch: Partial<ExpenseSettings>) => Promise<void>) | undefined
  children: ReactNode
}

/**
 * Which tips are showing, over the list kept on the account.
 *
 * A dismissal hides the tip at once and is saved in the background. What this visit has put away is kept apart from the
 * saved list and sent with it every time, so two quick dismissals cannot overwrite one another with a list that lacks the
 * first. If a save fails the tip stays gone for this visit and returns on the next load. Put it under a key that names the
 * person, so what one person put away this visit is never read as another's.
 */
export function TipsProvider({ saved, hasTransactions, save, children }: Props) {
  const [away, setAway] = useState<ReadonlySet<string>>(() => new Set())
  // Read by the handlers synchronously, so a second tap before the first render still sees the first.
  const awayRef = useRef(away)
  const savedRef = useRef(saved)
  const saveRef = useRef(save)
  useEffect(() => {
    savedRef.current = saved
    saveRef.current = save
  }, [saved, save])

  const isShown = useCallback(
    (id: string) => save !== undefined && !away.has(id) && !isTipSeen(saved, id, hasTransactions),
    [save, away, saved, hasTransactions],
  )

  const dismiss = useCallback((id: string) => {
    const write = saveRef.current
    if (!write) return
    awayRef.current = new Set(awayRef.current).add(id)
    setAway(awayRef.current)
    write({ tipsSeen: withTipSeen(savedRef.current, awayRef.current, id) }).catch(() => undefined)
  }, [])

  const showAgain = useCallback(async () => {
    const write = saveRef.current
    if (!write) return
    awayRef.current = new Set()
    setAway(awayRef.current)
    await write({ tipsSeen: [] })
  }, [])

  const value = useMemo<Tips>(() => ({ isShown, dismiss, showAgain }), [isShown, dismiss, showAgain])
  return <TipsContext value={value}>{children}</TipsContext>
}
