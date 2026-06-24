import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { ToastViewport, type ToastItem, type ToastTone } from '../components/Toast'
import { ToastContext } from './useToast'

const TOAST_MS = 2500

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<ToastItem | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const clear = useCallback(() => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = null
  }, [])

  const showToast = useCallback(
    (message: string, tone: ToastTone = 'info') => {
      clear()
      setToast({ id: Date.now(), message, tone })
      timer.current = setTimeout(() => setToast(null), TOAST_MS)
    },
    [clear],
  )

  useEffect(() => clear, [clear])

  const api = useMemo(() => ({ showToast }), [showToast])

  return (
    <ToastContext.Provider value={api}>
      {children}
      <ToastViewport toast={toast} onDismiss={() => setToast(null)} />
    </ToastContext.Provider>
  )
}
