import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { ToastViewport, type ToastAction, type ToastItem, type ToastTone } from '../components/Toast'
import { ToastContext } from './useToast'
import { useFailureToast } from './useFailureToast'

// An error has to be read and acted on, not just noticed, so it stays up longer.
const TOAST_MS: Record<ToastTone, number> = { info: 2500, success: 2500, error: 6000 }
// A button has to be found and pressed, which takes longer than reading.
const ACTION_TOAST_MS = 6000

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<ToastItem | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const clear = useCallback(() => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = null
  }, [])

  const showToast = useCallback(
    (message: string, tone: ToastTone = 'info', action?: ToastAction) => {
      clear()
      setToast({ id: Date.now(), message, tone, action })
      timer.current = setTimeout(() => setToast(null), action ? Math.max(ACTION_TOAST_MS, TOAST_MS[tone]) : TOAST_MS[tone])
    },
    [clear],
  )

  useEffect(() => clear, [clear])
  useFailureToast(showToast)

  const api = useMemo(() => ({ showToast }), [showToast])

  return (
    <ToastContext.Provider value={api}>
      {children}
      <ToastViewport toast={toast} onDismiss={() => setToast(null)} />
    </ToastContext.Provider>
  )
}
