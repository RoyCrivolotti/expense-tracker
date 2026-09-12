import type { ExpenseDataset } from '../../types'
import { buildSettlementSeed } from '../../domain/engine/claimSettlement'
import type { FlagGroup } from '../../domain/engine/flagGroups'
import { resolveDefaultAccountId } from '../../data/defaultAccount'
import type { TransactionSeed } from '../actions'

/**
 * Open the add form prefilled to settle a claim.
 *
 * A named function rather than an inline callback so the shape it hands to
 * `onAdd` is testable: the type has to be `refund` for the money to net against
 * the spending rather than read as income, and the flag has to travel with it
 * or the settlement lands outside the group it settles.
 *
 * No-ops when nothing is outstanding. The button is hidden in that case, so
 * this only fires if a second tab settled the claim first.
 */
export function settleClaim(
  group: FlagGroup,
  dataset: ExpenseDataset,
  onAdd: (seed?: TransactionSeed) => void,
): void {
  const seed = buildSettlementSeed(
    group,
    dataset.accounts,
    resolveDefaultAccountId(dataset.accounts, dataset.settings),
  )
  if (!seed) return
  onAdd({ ...seed, type: 'refund', flagId: group.flag.id })
}
