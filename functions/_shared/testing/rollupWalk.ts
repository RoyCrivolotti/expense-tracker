/**
 * A seeded random walk over every write path: after each step the rollup is compared with a fresh GROUP BY and
 * the cube read from the cells with `cubeSql` and `buildCells` (rollupOracle.ts), for both owners.
 */
import { OTHER, OWNER } from './expenseWorld'
import { OWNERS, assertRollup, chance, type Kit } from './rollupKit'
import {
  dropFlag, dropPlan, legacyPayment, newPlan, purgeAndRestore, readDataset, refillNorm, reassign, relabel, settle,
  switchPlan, unsettle, zeroCount,
} from './rollupLinkedSteps'
import { create, createMany, editByFilter, editFormChanged, editFormUnchanged, editPartial, editMany, remove, removeMany, setFlag, type Step } from './rollupSteps'

/** How often each step is taken, in thousandths; the writes that move rows between cells are the common ones. */
export const WEIGHTS: Array<[number, Step]> = [
  [160, create], [40, createMany], [60, editFormUnchanged], [150, editFormChanged], [70, editPartial], [40, setFlag],
  [60, remove], [30, removeMany], [90, editMany], [20, editByFilter], [50, settle], [30, unsettle],
  [10, legacyPayment], [20, zeroCount], [20, relabel], [10, dropFlag], [20, newPlan], [10, switchPlan],
  [10, dropPlan], [20, reassign], [10, refillNorm], [8, purgeAndRestore], [30, readDataset],
]

function nextStep(k: Kit): Step {
  const total = WEIGHTS.reduce((sum, [weight]) => sum + weight, 0)
  let draw = k.rng() * total
  for (const [weight, step] of WEIGHTS) {
    draw -= weight
    if (draw < 0) return step
  }
  return WEIGHTS[0]![1]
}

/** Some rows for both owners, so the first steps have something to move. */
export async function seedRows(k: Kit, perOwner: number): Promise<void> {
  for (const owner of OWNERS) {
    for (let i = 0; i < perOwner; i += 1) await create(k, owner)
  }
}

/** Takes `steps` steps, the second owner now and then, and checks the rollup after each one unless `check` is off. */
export async function walk(k: Kit, steps: number, check = true): Promise<void> {
  if (check) await assertRollup(k, 'seeding')
  for (let i = 0; i < steps; i += 1) {
    const owner = chance(k, 0.75) ? OWNER : OTHER
    const label = await nextStep(k)(k, owner)
    k.history.push(`${i}: ${owner} ${label}`)
    if (check) await assertRollup(k, `step ${i} (${label})`)
  }
}

