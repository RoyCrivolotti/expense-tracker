import { useMemo, useRef } from 'react'
import type { ExpenseSettings } from '../types'
import type { ExpenseDataSource } from '../data/dataSource'
import { patchAfterSettings } from './referencePatches'
import type { ExpenseActions, ExpenseModalState } from './actions'
import { type ApplyPatch, bulkWriteOf } from './bulkWrite'
import { createWrites } from './createWrites'
import { duplicateHint, openAddModal, transactionToSeed } from './transactionSeed'
import { planningWrites, wealthWrites } from './planningWrites'
import { referenceWrites, tagWrites } from './referenceWrites'
import { statementWrites, transactionWrites } from './transactionWrites'

type OpenModal = (state: Exclude<ExpenseModalState, null>) => void
/**
 * Build the write-actions object, or `undefined` for read-only sources. `readAgain` reads the whole of what the screens
 * show again, for a write that may have been saved though it did not answer, which nothing else shows (a model that holds
 * every row is only told what each answered write did).
 */
export function useExpenseActions(
  source: ExpenseDataSource,
  applyPatch: ApplyPatch,
  openModal: OpenModal,
  readOnly = false,
  readAgain?: () => void,
): ExpenseActions | undefined {
  // Which settings write each setting was last taken from. A write's answer is the whole settings
  // row as it stood then, so an older write answering late must not undo a newer one's.
  const settingsOrder = useRef({ issued: 0, applied: new Map<keyof ExpenseSettings, number>() })
  return useMemo(() => {
    if (!source.canWrite || readOnly) return undefined
    const bulkWrite = bulkWriteOf(applyPatch)
    return {
      onAdd: (seed) => openAddModal(openModal, seed),
      onDuplicate: (txn) => openModal({ mode: 'add', seed: transactionToSeed(txn), hint: duplicateHint(txn) }),
      onEdit: (txn) => openModal({ mode: 'edit', txn }),
      ...createWrites(source, applyPatch, readAgain),
      ...transactionWrites(source, applyPatch, bulkWrite),
      ...statementWrites(source, applyPatch),
      ...tagWrites(source, applyPatch),
      ...referenceWrites(source, applyPatch),
      updateSettings: async (patch) => {
        const order = settingsOrder.current
        const turn = ++order.issued
        const settings = await source.updateSettings!(patch)
        // Only what this write changed, and only if no later write to it has been taken already.
        const keys = (Object.keys(patch) as (keyof ExpenseSettings)[]).filter(
          (key) => (order.applied.get(key) ?? 0) < turn,
        )
        for (const key of keys) order.applied.set(key, turn)
        applyPatch((d) => patchAfterSettings(d, settings, keys))
      },
      ...planningWrites(source, applyPatch),
      ...wealthWrites(source, applyPatch),
    }
  }, [source, applyPatch, openModal, readOnly, readAgain])
}
