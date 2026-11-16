import { cleanText } from './text'

/**
 * The words of a push as the reader sees them: cleaned, then split on whitespace. Punctuation stays on the
 * token it is stuck to, so a token's position is the same however the text is spelt around it.
 */
export function tokenise(text: string): string[] {
  const cleaned = cleanText(text)
  return cleaned ? cleaned.split(' ') : []
}
