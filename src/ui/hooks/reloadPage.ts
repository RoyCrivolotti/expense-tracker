import { reloadWhenNothingOpen } from './updateReloadHold'

/** The reload both update paths (the worker taking over, and Workbox's own) go through, so neither can skip a held form. */
export function reloadPageWhenNothingOpen(): void {
  reloadWhenNothingOpen(() => window.location.reload())
}
