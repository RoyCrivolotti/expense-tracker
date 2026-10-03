import type { ToastShortcut } from './Toast'

/** Alt+Z: the button's own Tab stop is the last on the page, so an undo has to be reachable from where the keyboard is. */
export const UNDO_SHORTCUT: ToastShortcut = { code: 'KeyZ', label: 'Alt+Z' }
