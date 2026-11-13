import type { CaptureSource } from '../capture/types'
import type {
  CaptureCard,
  CaptureRepository,
  CardDigitsKind,
  LinkCardResult,
  WaitingCard,
} from '../ports/captureRepository'
import { ValidationError } from './validationError'

/** The bank apps the Worker accepts. */
export const CARD_SOURCES: readonly CaptureSource[] = ['iberia', 'santander']
const DIGIT_KINDS: readonly CardDigitsKind[] = ['card', 'account']
/** A card's last four and an account's last digits are four digits in the pushes seen, so four is all that is accepted. */
const DIGITS_PATTERN = /^\d{4}$/

function objectOf(body: unknown): Record<string, unknown> {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    throw new ValidationError('Request body must be a JSON object')
  }
  return body as Record<string, unknown>
}

/**
 * Which digits are meant. The messages never repeat what was sent, so a wrong value is not echoed into an error or a
 * log. `digitsKind` is a card unless the person says otherwise.
 */
function parseDigits(body: Record<string, unknown>): Omit<CaptureCard, 'accountId'> {
  const source = CARD_SOURCES.find((s) => s === body.source)
  if (!source) throw new ValidationError('source must be a bank app this app knows')
  const kind = body.digitsKind === undefined ? 'card' : DIGIT_KINDS.find((k) => k === body.digitsKind)
  if (!kind) throw new ValidationError('digitsKind must be card or account')
  if (typeof body.digits !== 'string' || !DIGITS_PATTERN.test(body.digits)) {
    throw new ValidationError('digits must be exactly four digits')
  }
  return { source, digitsKind: kind, digits: body.digits }
}

export function parseCardLink(body: unknown): CaptureCard {
  const fields = objectOf(body)
  const accountId = fields.accountId
  if (typeof accountId !== 'number' || !Number.isInteger(accountId) || accountId <= 0) {
    throw new ValidationError('accountId must be a positive whole number')
  }
  return { ...parseDigits(fields), accountId }
}

export function linkCaptureCard(repo: CaptureRepository, owner: string, body: unknown): Promise<LinkCardResult> {
  return repo.linkCard(owner, parseCardLink(body))
}

/** False when there was no such link for this person, which is also what another person's link answers. */
export function unlinkCaptureCard(repo: CaptureRepository, owner: string, body: unknown): Promise<boolean> {
  const { source, digitsKind, digits } = parseDigits(objectOf(body))
  return repo.unlinkCard(owner, source, digitsKind, digits)
}

export async function listCaptureCards(
  repo: CaptureRepository,
  owner: string,
): Promise<{ cards: CaptureCard[]; waiting: WaitingCard[] }> {
  const [cards, waiting] = await Promise.all([repo.listCards(owner), repo.listWaitingCards(owner)])
  return { cards, waiting }
}
