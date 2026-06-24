import { createContext, useContext } from 'react'
import type { ToastTone } from '../components/Toast'

export interface ToastApi {
  showToast: (message: string, tone?: ToastTone) => void
}

/** No-op default so components/hooks work outside a provider (tests, partial mounts). */
export const ToastContext = createContext<ToastApi>({ showToast: () => {} })

export function useToast(): ToastApi {
  return useContext(ToastContext)
}
