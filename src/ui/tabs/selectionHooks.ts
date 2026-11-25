import { useEffect, useEffectEvent, useMemo, useState } from 'react'

/**
 * A dialog or popover on screen owns Escape; the list behind it does not. One that is
 * `inert` is on its way out and answers nothing, so it does not count.
 */
function dialogIsOpen(): boolean {
  return [...document.querySelectorAll('[role="dialog"], [role="alertdialog"]')].some(
    (el) => el.closest('[hidden], [inert]') === null,
  )
}

/** Whether selecting is on, and the shell told about it, including when the tab is left mid-selection. */
export function useSelectMode(onSelectModeChange: ((selecting: boolean) => void) | undefined) {
  const [selectMode, setSelectModeState] = useState(false)
  // Reported from the handlers that change it rather than mirrored in an effect, so the
  // shell hears about it in the same update.
  const setSelectMode = (selecting: boolean) => {
    setSelectModeState(selecting)
    onSelectModeChange?.(selecting)
  }
  // Leaving the tab mid-selection unmounts it without any handler running. Without this
  // the shell would keep the month locked on every other tab.
  const reportLeft = useEffectEvent(() => onSelectModeChange?.(false))
  useEffect(() => () => reportLeft(), [])
  return { selectMode, setSelectMode }
}

/** The picked rows that are on screen, and how many picked rows are not shown and not gone. */
export function useVisiblePicked(
  picked: Set<number>,
  visibleIds: readonly number[] | undefined,
  existingIds: readonly number[] | undefined,
) {
  const selected = useMemo(() => {
    if (!visibleIds || picked.size === 0) return picked
    const visible = new Set(visibleIds)
    const onScreen = new Set<number>()
    for (const id of picked) if (visible.has(id)) onScreen.add(id)
    // Nothing hidden: hand back the same Set, so a render with no filter change does
    // not look like a selection change to anything memoised on it.
    return onScreen.size === picked.size ? picked : onScreen
  }, [picked, visibleIds])

  // A row deleted elsewhere is never on screen, so it never reaches `selected` and is
  // never acted on. It is only left out of this count, because no filter will bring it
  // back and "not shown" would promise otherwise. Derived rather than pruned from state,
  // which keeps every update driven by what the user did.
  const hiddenCount = useMemo(() => {
    if (!existingIds) return picked.size - selected.size
    const exists = new Set(existingIds)
    let stillThere = 0
    for (const id of picked) if (exists.has(id)) stillThere++
    return stillThere - selected.size
  }, [picked, selected, existingIds])
  return { selected, hiddenCount }
}

/** Escape leaves select mode, unless a dialog owns the key or a bulk action is running. */
export function useEscapeToExit(
  selectMode: boolean,
  busy: boolean,
  exitSelect: () => void,
) {
  const onEscape = useEffectEvent(() => {
    if (!busy) exitSelect()
  })
  useEffect(() => {
    if (!selectMode) return
    // Capture phase, so this looks before anything acts on the key. By the bubble phase
    // React has already closed and removed the dialog the Escape was for, and a layer from
    // another package (the hub menu) does not mark the key as used.
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !dialogIsOpen()) onEscape()
    }
    window.addEventListener('keydown', handler, true)
    return () => window.removeEventListener('keydown', handler, true)
  }, [selectMode])
}
