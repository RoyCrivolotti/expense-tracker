import { ValidationError } from './validationError'

// Control characters, zero-width and line-separator characters, the byte-order mark and the bidirectional overrides and
// isolates: a label is shown back in a list, and a hostile one could hide or reorder what is around it. Written as
// escapes so the source holds no invisible character.
// eslint-disable-next-line no-control-regex
const UNSAFE_LABEL_CHARS = /[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u2028\u2029\u202a-\u202e\u2066-\u2069\ufeff]/

/** A short name the person gives a thing of theirs. Blank or missing becomes `fallback`. */
export function validateLabel(label: unknown, fallback: string, maxLength: number): string {
  if (label === undefined || label === null) return fallback
  if (typeof label !== 'string') throw new ValidationError('Label must be text')
  const trimmed = label.trim()
  if (UNSAFE_LABEL_CHARS.test(trimmed)) throw new ValidationError('Label cannot contain control characters')
  if (trimmed.length > maxLength) throw new ValidationError(`Label must be at most ${maxLength} characters`)
  return trimmed || fallback
}
