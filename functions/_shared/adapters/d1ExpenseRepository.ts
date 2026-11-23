import type { ExpenseRepository } from '../../domain/ports/expenseRepository'
import type { Env } from '../env'
import { attachments, ledgerReads, ledgerWrites } from './d1ExpenseLedger'
import { flagsAndLabels, reference } from './d1ExpenseReference'
import { planning, wealth } from './d1ExpensePlanning'

/** Cloudflare D1 adapter for {@link ExpenseRepository}. */
export function createD1ExpenseRepository(env: Env): ExpenseRepository {
  return {
    ...ledgerReads(env),
    ...ledgerWrites(env),
    ...attachments(env),
    ...flagsAndLabels(env),
    ...reference(env),
    ...planning(env),
    ...wealth(env),
  }
}
