import { describe, expect, it, vi } from 'vitest'
import { deleteInstallmentPlan } from './dbInstallments'
import type { Env } from './env'

/**
 * Records how the delete reaches D1: which statements went through `batch` together,
 * and whether anything was run on its own outside one.
 */
function envForDelete(opts: { deleted?: number } = {}) {
  const { deleted = 1 } = opts
  const batched: string[][] = []
  const ranAlone: string[] = []
  const env = {
    DB: {
      batch: vi.fn((stmts: { sql: string }[]) => {
        batched.push(stmts.map((s) => s.sql))
        return Promise.resolve(
          stmts.map((s) => ({
            meta: { changes: s.sql.includes('DELETE FROM installment_plans') ? deleted : 1 },
          })),
        )
      }),
      prepare: (sql: string) => ({
        sql,
        bind: () => ({
          sql,
          run: vi.fn(() => {
            ranAlone.push(sql)
            return Promise.resolve({ meta: { changes: deleted } })
          }),
        }),
      }),
    },
  } as unknown as Env
  return { env, batched, ranAlone }
}

describe('deleteInstallmentPlan', () => {
  it('unlinks the payments and drops the plan in one batch', async () => {
    // Apart, a failed delete leaves the plan alive with every payment already
    // unlinked, and the next installment recomputes its index from
    // MAX(installment_index) as though nothing had ever been paid.
    const { env, batched, ranAlone } = envForDelete()

    await deleteInstallmentPlan(env, 'a@b.com', 7)

    expect(batched).toHaveLength(1)
    expect(batched[0]).toHaveLength(2)
    expect(batched[0]![0]).toContain('UPDATE transactions')
    expect(batched[0]![0]).toContain('plan_id = NULL')
    expect(batched[0]![1]).toContain('DELETE FROM installment_plans')
    expect(ranAlone).toEqual([])
  })

  it('still reports a plan that was not there', async () => {
    const { env } = envForDelete({ deleted: 0 })

    await expect(deleteInstallmentPlan(env, 'a@b.com', 7)).rejects.toThrow(
      'Installment plan not found',
    )
  })
})
