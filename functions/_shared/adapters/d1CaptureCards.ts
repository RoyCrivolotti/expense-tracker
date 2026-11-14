import type { CaptureRepository } from '../../../src/domain/ports/captureRepository'
import {
  ACCOUNT_EXISTS_SQL,
  CLEAR_OPEN_OF_UNLINKED_SQL,
  LINK_CARD_SQL,
  POINT_OPEN_AT_LINK_SQL,
  UNLINK_CARD_SQL,
  WAITING_CARDS_SQL,
} from '../capture/captureCardsSql'
import { LIST_CARDS_SQL, SAVE_CARD_SQL } from '../capture/captureEventsSql'
import { changed, rows } from './d1CaptureSupport'

export function cards(
  db: D1Database,
): Pick<CaptureRepository, 'saveCard' | 'listCards' | 'linkCard' | 'unlinkCard' | 'listWaitingCards'> {
  return {
    linkCard: async (owner, c) => {
      const bound = [owner, c.source, c.digitsKind, c.digits]
      const [saved] = await db.batch([
        db.prepare(LINK_CARD_SQL).bind(...bound, c.accountId),
        db.prepare(POINT_OPEN_AT_LINK_SQL).bind(...bound, c.accountId),
      ])
      if ((saved?.meta?.changes ?? 0) > 0) return 'linked'
      return (await db.prepare(ACCOUNT_EXISTS_SQL).bind(owner, c.accountId).first()) ? 'limit' : 'no-account'
    },
    unlinkCard: async (owner, source, kind, digits) => {
      const bound = [owner, source, kind, digits]
      const [removed] = await db.batch([db.prepare(UNLINK_CARD_SQL).bind(...bound), db.prepare(CLEAR_OPEN_OF_UNLINKED_SQL).bind(...bound)])
      return (removed?.meta?.changes ?? 0) > 0
    },
    listWaitingCards: async (owner) =>
      (await rows<{ source: string; digits: string; n: number }>(db, WAITING_CARDS_SQL, owner)).map((r) => ({
        source: r.source,
        digits: r.digits,
        count: r.n,
      })),
    saveCard: async (owner, c) => {
      await changed(db, SAVE_CARD_SQL, owner, c.source, c.digitsKind, c.digits, c.accountId)
    },
    listCards: async (owner) =>
      (
        await rows<{ source: string; digits_kind: string; digits: string; account_id: number }>(
          db,
          LIST_CARDS_SQL,
          owner,
        )
      ).map((r) => ({
        source: r.source,
        digitsKind: r.digits_kind as 'card' | 'account',
        digits: r.digits,
        accountId: r.account_id,
      })),
  }
}
