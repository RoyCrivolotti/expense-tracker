import { req } from './apiClient'

export type CardSource = string

/** One link: the digits a bank app shows, and the account they are. */
export interface CardLink {
  source: CardSource
  digitsKind: 'card' | 'account'
  digits: string
  accountId: number
}

/** Digits with open payments and no account to put them in. */
export interface WaitingCard {
  source: CardSource
  digits: string
  count: number
}

export interface CardLinks {
  cards: CardLink[]
  waiting: WaitingCard[]
}

const JSON_HEADERS = { 'content-type': 'application/json' }

export function fetchCardLinks(): Promise<CardLinks> {
  return req<CardLinks>('/api/capture-cards')
}

/** Links four digits of a bank app to an account. Saving it again changes nothing. */
export async function linkCard(source: CardSource, digits: string, accountId: number): Promise<void> {
  await req<{ ok: true }>('/api/capture-cards', { method: 'POST', headers: JSON_HEADERS, body: JSON.stringify({ source, digits, accountId }) })
}

/** The digits travel in the body, never in the address. */
export async function unlinkCard(link: Pick<CardLink, 'source' | 'digitsKind' | 'digits'>): Promise<void> {
  const { source, digitsKind, digits } = link
  await req<{ ok: true }>('/api/capture-cards', { method: 'DELETE', headers: JSON_HEADERS, body: JSON.stringify({ source, digitsKind, digits }) })
}
