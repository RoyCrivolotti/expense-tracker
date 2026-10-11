import { useEffect } from 'react'

/**
 * The forms on the Plan page that are open to add or edit something that is not in the draft yet: a monthly change, a
 * life event. Save writes the draft, which does not have what is typed in them, and used to say "Saved" as if it did. They
 * join this while they are mounted and Save reads the count when it builds its toast. A count in a module, not context,
 * because the reader is the save hook, which sits above the page that holds the forms, and there is one Plan page.
 */
let open = 0

/** Counts a form as open until the function returned is called (once; a second call does nothing). */
export function registerOpenForm(): () => void {
  open += 1
  let released = false
  return () => {
    if (released) return
    released = true
    open -= 1
  }
}

export function openFormCount(): number {
  return open
}

/** Counts the component that uses it as an open form for as long as it is mounted. */
export function useRegisterOpenForm(): void {
  useEffect(() => registerOpenForm(), [])
}
