import type { ExpenseRepository } from '../domain/ports/expenseRepository'
import { attachments } from './inMemoryAttachments'
import { flagsAndLabels } from './inMemoryFlagsAndLabels'
import { ledgerReads } from './inMemoryLedgerReads'
import { ledgerWrites } from './inMemoryLedgerWrites'
import { planning } from './inMemoryPlanning'
import { wealth } from './inMemoryWealth'
import { reference } from './inMemoryReference'
import { createState, type ExpenseRepositorySeed } from './inMemoryStore'

/**
 * The repository's areas, one per role of the port, all reading and writing one state: a write through one area is
 * seen through every other.
 */
export function inMemoryExpenseRepository(
  seed: ExpenseRepositorySeed = {},
  seedOwner = 'owner@example.com',
): ExpenseRepository {
  const state = createState(seed, seedOwner)
  return {
    ...ledgerReads(state),
    ...ledgerWrites(state),
    ...attachments(state),
    ...flagsAndLabels(state),
    ...reference(state),
    ...planning(state),
    ...wealth(state),
  }
}
