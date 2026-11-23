import type { CaptureSource } from '../capture/types'

export type CardDigitsKind = 'card' | 'account'

export type LinkCardResult = 'linked' | 'no-account' | 'limit'

/** Digits with open payments and no account to put them in. */
export interface WaitingCard {
  source: CaptureSource
  digits: string
  /** How many open payments wait on it. */
  count: number
}

/** The most links one person may hold. Each card has one, and a reissued card is another. */
export const MAX_CAPTURE_CARDS = 50

export interface CaptureCard {
  source: CaptureSource
  digitsKind: CardDigitsKind
  digits: string
  accountId: number
}

/** The cards a person linked to accounts, and the ones payments wait on. */
export interface CaptureCardLinks {
  saveCard(
    owner: string,
    card: CaptureCard,
  ): Promise<void>
  /**
   * Links digits to one of the owner's accounts, or changes the account they point at, and points the open
   * recommendations those digits made at it. `no-account` when the account is not the owner's, `limit` at the cap.
   */
  linkCard(
    owner: string,
    card: CaptureCard,
  ): Promise<LinkCardResult>
  /** Removes the link, and unmaps the open recommendations those digits made. False when there was none. */
  unlinkCard(
    owner: string,
    source: CaptureSource,
    digitsKind: CardDigitsKind,
    digits: string,
  ): Promise<boolean>
  /** The cards open payments wait on for want of an account. */
  listWaitingCards(owner: string): Promise<WaitingCard[]>
  listCards(owner: string): Promise<CaptureCard[]>
}
