import { createContext, useContext } from 'react'
import type { ToastAction, ToastTone } from '../components/Toast'

export interface ToastApi {
  /** `action` adds a button to the toast, which then stays up longer to be read and pressed. */
  /** `holdMs` sets how long it stays up, for a message that is only true for that long. A new line (`\n`) starts a new line. */
  showToast: (message: string, tone?: ToastTone, action?: ToastAction, holdMs?: number) => void
}

/** No-op default so components/hooks work outside a provider (tests, partial mounts). */
export const ToastContext = createContext<ToastApi>({ showToast: () => {} })

export function useToast(): ToastApi {
  return useContext(ToastContext)
}
