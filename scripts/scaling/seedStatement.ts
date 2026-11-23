/**
 * What the seed's statements are made of: the tables whose ids are moved into a block of their own, one step of
 * the seed, and the single-statement JSON insert every table but the label links uses.
 */
import { SYNTHETIC_OWNER } from './guard'
import type { Statement } from './transport'

export const ID_TABLES = ['categories', 'accounts', 'flags', 'labels', 'installment_plans', 'transactions'] as const
export type IdTable = (typeof ID_TABLES)[number]
export type IdBases = Record<IdTable, number>

export interface SeedStep {
  statement: Statement
  table: string
  rows: number
  /** Rows D1 should report written, when the plan can say exactly. Only transactions can. */
  expectedWritten?: number
}

export type Row = Record<string, unknown>

export function jsonInsert(
  table: string,
  columns: string[],
  rows: Row[],
  keys: string[] = columns,
): Statement {
  const select = keys.map((k) => `json_extract(value, '$.${k}')`).join(', ')
  return {
    sql: `INSERT INTO ${table} (owner, ${columns.join(', ')}) SELECT ?1, ${select} FROM json_each(?2)`,
    params: [SYNTHETIC_OWNER, JSON.stringify(rows)],
  }
}

export const bit = (value: boolean): number => (value ? 1 : 0)
