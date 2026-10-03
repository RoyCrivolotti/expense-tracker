import { createContext, useContext } from 'react'
import type { ToastAction, ToastTone } from '../components/Toast'

export interface ToastApi {
  /** `action` adds a button to the toast, which then stays up longer to be read and pressed. */
  showToast: (message: string, tone?: ToastTone, action?: ToastAction) => void
}

/** No-op default so components/hooks work outside a provider (tests, partial mounts). */
export const ToastContext = createContext<ToastApi>({ showToast: () => {} })

export function useToast(): ToastApi {
  return useContext(ToastContext)
}
