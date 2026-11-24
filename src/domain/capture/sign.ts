import type { Direction } from './direction'
import { splitNumberToken } from './currency'
import { currencyAmount, type Slot } from './slots'

/**
 * Which way the push's own sign says the money moved: out for a minus glued to the amount (`-47,15`, `−47,15`,
 * `€-47,15`), in for a plus (`+47,15`), null when the amount carries no sign. The amount is the number at `amountSlot`
 * when the template learned one, else the push's one currency-marked number. A sign the bank wrote is a fact about this
 * push, so it outranks anything learned about the wording, which one bank uses for money both ways ("a movement of
 * -47,15 EUR", "a movement of 64,20 EUR").
 *
 * Only a sign on the number's own token counts. A dash standing apart is as often a separator ("Bizum recibido de Ana -
 * 20,00 EUR") as a minus, and reading it as one would turn money in into an expense and stop the wording learning.
 * Read from the token as written, so slots stored before this rule give the same answer.
 *
 * Apart from `direction.ts` because that file is in the app's main bundle and this one needs the push reader.
 */
export function signedDirection(
  slots: readonly Slot[],
  amountSlot: number | null,
): Direction | null {
  const learned = amountSlot === null ? undefined : slots.find((s) => s.index === amountSlot)
  const slot = learned?.kind === 'number' ? learned : currencyAmount(slots)
  const written = slot ? splitNumberToken(slot.raw) : null
  if (written?.negative) return 'out'
  return written?.positive ? 'in' : null
}
