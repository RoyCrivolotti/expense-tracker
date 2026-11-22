import { useEffect } from 'react'

/**
 * The one place that decides whether a reload for a new app version may happen now.
 *
 * A deploy replaces the service worker, and the app then reloads itself. A reload throws away whatever is typed, so
 * anything that can hold typing takes a hold here, and the reload waits until the last hold is released. There are two
 * kinds of hold. A surface takes one by being mounted: every dialog and popover through its focus trap, and the inline
 * check-in form directly, so nothing has to remember to release on save or discard. Read-only sheets hold too, on purpose,
 * to keep that one rule. A text field takes one while it has focus (`trackTypingFocus`), which covers fields that are
 * always on screen, such as the settings.
 *
 * Holds survive the app going to the background. Reloading then would still discard what is typed, and the person finds
 * it as they left it; the reload runs when they close the form or leave the field.
 */
let holds = 0
let pending: (() => void) | null = null
let pollTimer: ReturnType<typeof setInterval> | undefined
let reconcileFocus: () => void = () => undefined

function runPending() {
  reconcileFocus()
  if (holds > 0 || !pending) {
    // A focused field that is removed from the page fires no blur, so while a reload waits, look again now and then.
    if (pending && !pollTimer) pollTimer = setInterval(runPending, 1000)
    return
  }
  if (pollTimer) clearInterval(pollTimer)
  pollTimer = undefined
  const run = pending
  pending = null
  run()
}

/** Takes a hold. The returned function releases it, once, and runs a held reload if it was the last. */
export function holdUpdateReload(): () => void {
  holds += 1
  let released = false
  return () => {
    if (released) return
    released = true
    holds -= 1
    runPending()
  }
}

/** Runs `reload` now when nothing is open, otherwise when the last hold is released. Asking twice reloads once. */
export function reloadWhenNothingOpen(reload: () => void): void {
  pending ??= reload
  runPending()
}

/** Holds a held reload back for as long as the caller stays mounted. */
export function useHoldUpdateReload(): void {
  useEffect(() => holdUpdateReload(), [])
}

const NOT_TEXT = new Set([
  'button',
  'checkbox',
  'radio',
  'range',
  'submit',
  'reset',
  'image',
  'file',
  'color',
  'hidden',
])

/** A field where typing can be lost: not a button, a checkbox or a slider. */
export function isTextEntry(el: Element | null): boolean {
  if (!(el instanceof HTMLElement)) return false
  if (el instanceof HTMLTextAreaElement) return !el.readOnly
  if (el instanceof HTMLInputElement) return !NOT_TEXT.has(el.type) && !el.readOnly
  // The attribute as well as the property, which jsdom does not implement.
  return (
    el.isContentEditable || ['', 'true', 'plaintext-only'].includes(el.getAttribute('contenteditable') ?? 'inherit')
  )
}

/**
 * Holds while focus is in a text-entry field, wherever it is on screen. The hold is one, however many fields focus passes
 * through, and a sheet's own hold counts separately, so a field inside an open sheet adds nothing that outlives it.
 * Returns a function that stops listening.
 */
export function trackTypingFocus(doc: Document = document): () => void {
  let release: (() => void) | null = null
  const sync = () => {
    const typing = isTextEntry(doc.activeElement) && doc.activeElement?.isConnected === true
    if (typing && !release) release = holdUpdateReload()
    else if (!typing && release) {
      const done = release
      release = null
      done()
    }
  }
  reconcileFocus = sync
  doc.addEventListener('focusin', sync)
  doc.addEventListener('focusout', () => queueMicrotask(sync))
  return () => {
    doc.removeEventListener('focusin', sync)
    reconcileFocus = () => undefined
    release?.()
  }
}

/** For tests: forgets every hold and any waiting reload. */
export function resetUpdateReloadHoldForTests(): void {
  holds = 0
  pending = null
  if (pollTimer) clearInterval(pollTimer)
  pollTimer = undefined
  reconcileFocus = () => undefined
}
