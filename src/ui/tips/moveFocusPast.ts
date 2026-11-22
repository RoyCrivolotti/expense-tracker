import { FOCUSABLE } from '../hooks/useFocusTrap'

/**
 * Before a card that has focus inside it goes away, hands the focus to the next control after it on the page, so a keyboard
 * or screen reader user carries on from where the card was rather than from the top of the document. Does nothing when the
 * focus is not in the card.
 */
export function moveFocusPast(card: HTMLElement | null): void {
  if (!card?.contains(document.activeElement)) return
  const next = [...document.querySelectorAll<HTMLElement>(FOCUSABLE)].find(
    (el) =>
      !card.contains(el) &&
      el.tabIndex >= 0 &&
      (card.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0 &&
      el.closest('[inert], [hidden], [aria-hidden="true"]') === null,
  )
  next?.focus()
}
