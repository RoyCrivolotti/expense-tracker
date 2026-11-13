import { createContext, useContext } from 'react'
import type { ToastAction, ToastTone } from '../components/Toast'

export interface ToastApi {
  /** `action` adds a button to the toast, which then stays up longer to be read and pressed. */
  /**
   * `holdMs` sets how long it stays, for a message that is only true for that long, and `key` names it so
   * `dismissToast` can take down this toast and no other. A new line (`\n`) in a message starts a new line.
   */
  showToast: (message: string, tone?: ToastTone, action?: ToastAction, options?: ToastOptions) => void
  /** Takes down the toast named `key` if it is still the one showing. A later toast is left alone. */
  dismissToast?: (key: string) => void
}

export interface ToastOptions {
  holdMs?: number
  key?: string
  /** A tap on the words leaves the toast up. The button, and the time, still end it. */
  keepOnTap?: boolean
}

/** No-op default so components/hooks work outside a provider (tests, partial mounts). */
export const ToastContext = createContext<ToastApi>({ showToast: () => {} })

export function useToast(): ToastApi {
  return useContext(ToastContext)
}
