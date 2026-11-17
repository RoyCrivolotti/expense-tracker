/** What each placeholder of a template's masked words stands for, as the Settings list names it. */
const SLOT_NAME: Record<string, string> = {
  '<N>': 'number',
  '<C>': 'currency',
  '<D>': 'card',
  '<DATE>': 'date',
  '<CODE>': 'code',
  '<X>': 'number',
  '<M>': 'merchant',
}

export type WordingPart = { text: string } | { slot: string }

/**
 * A template's masked words as runs of plain text and named slots, so the list can show where the amount, the card or
 * the merchant sat without showing any of them. Neighbouring words join into one run.
 */
export function wordingParts(skeleton: string): WordingPart[] {
  const parts: WordingPart[] = []
  for (const token of skeleton.split(' ').filter(Boolean)) {
    const slot = SLOT_NAME[token]
    const last = parts[parts.length - 1]
    if (slot) parts.push({ slot })
    else if (last && 'text' in last) last.text = `${last.text} ${token}`
    else parts.push({ text: token })
  }
  return parts
}

/** The same words as plain text, each slot said by its name, for a label a screen reader reads out. */
export function wordingText(skeleton: string): string {
  return wordingParts(skeleton)
    .map((part) => ('slot' in part ? part.slot : part.text))
    .join(' ')
}
