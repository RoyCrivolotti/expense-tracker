/**
 * A fresh world for one rollup run: SQLite with the migrations, both owners allowed, the clock pinned, and
 * reference rows for each owner. `migrate` lets a run use a different database, such as one whose triggers
 * have been weakened.
 */
import { createExpenseWorld, pinClock, type World } from './expenseWorld'
import { seedReference, seeded, type Kit } from './rollupKit'
import type { Sqlite } from './rollupOracle'

export async function newKit(sqlite: Sqlite, d1: Parameters<typeof createExpenseWorld>[1], seed: number): Promise<Kit> {
  pinClock('2026-10-15')
  const world: World = createExpenseWorld(sqlite, d1)
  const k: Kit = { world, sqlite, rng: seeded(seed), history: [] }
  await seedReference(k)
  return k
}
