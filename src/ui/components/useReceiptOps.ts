import { useState, type RefObject } from 'react'
import { RECEIPT_CLIENT_POLICY } from '../../data/receiptClientPolicy'
import { removeStaged, stageReceipts, type PendingReceipt } from '../../data/pendingReceipts'
import type { ExpenseActions } from '../actions'

function errText(
  e: unknown,
  fallback: string,
): string {
  return e instanceof Error ? e.message : fallback
}

function capFilter(
  chosen: File[],
  total: number,
): { kept: File[]; error: string | null } {
  const room = Math.max(0, RECEIPT_CLIENT_POLICY.maxPerTransaction - total)
  if (chosen.length <= room) return { kept: chosen, error: null }
  const dropped = chosen.length - room
  return {
    kept: chosen.slice(0, room),
    error: `Only ${RECEIPT_CLIENT_POLICY.maxPerTransaction} receipts fit — ${dropped} ${
      dropped === 1 ? 'was' : 'were'
    } not added.`,
  }
}

export function useReceiptOps(
  transactionId: number | undefined,
  total: number,
  inputRef: RefObject<HTMLInputElement | null>,
  pendingFiles: PendingReceipt[],
  onPendingChange: ((files: PendingReceipt[]) => void) | undefined,
  actions: ExpenseActions,
) {
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const add = async (files: FileList | null) => {
    if (!files || files.length === 0) return
    setErr(null)
    const { kept, error } = capFilter(Array.from(files), total)
    if (error) setErr(error)
    if (inputRef.current) inputRef.current.value = ''
    if (kept.length === 0) return

    if (transactionId == null) {
      onPendingChange?.([...pendingFiles, ...stageReceipts(kept)])
      return
    }

    setBusy(true)
    try {
      for (const file of kept) {
        await actions.uploadAttachment(transactionId, file)
      }
    } catch (e) {
      setErr(errText(e, 'Could not add the receipt'))
    } finally {
      setBusy(false)
    }
  }

  const remove = async (id: number) => {
    setBusy(true)
    setErr(null)
    try {
      await actions.deleteAttachment(id)
    } catch (e) {
      setErr(errText(e, 'Could not remove the receipt'))
    } finally {
      setBusy(false)
    }
  }

  const unstage = (index: number) => {
    setErr(null)
    onPendingChange?.(removeStaged(pendingFiles, index))
  }

  return { busy, err, add, remove, unstage }
}
