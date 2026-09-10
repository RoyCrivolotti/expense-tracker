import { useEffect, useRef, useState } from 'react'
import { resolveDefaultAccountId } from '../../data/defaultAccount'
import { PlusIcon } from '../icons'
import { useMoneyFormat } from '../hooks/moneyFormatContext'
import { useToast } from '../hooks/useToast'
import type { ExpenseActions } from '../actions'
import type { ExpenseModel } from '../useExpenseData'
import {
  applyGroupDefaults,
  buildGroupedTransactions,
  groupTotals,
  isLineEmpty,
  lineError,
  nextGroupSeed,
  type EntryGroupDraft,
  type GroupLineDraft,
} from './groupedTransactionIntent'
import { EntryGroupCard } from './EntryGroupCard'
import { Money } from './Money'
import { todayIso } from './transactionFormState'
import formStyles from './TransactionForm.module.css'
import styles from './GroupedTransactionForm.module.css'

interface GroupedTransactionFormProps {
  model: ExpenseModel
  actions: ExpenseActions
  onClose: () => void
  /** Kept mounted but visually hidden (e.g. while the single-transaction tab is
   * active), so its own state survives switching back rather than losing typed lines. */
  hidden?: boolean
  /** Reports whether anything has been entered, so a caller can warn before
   * discarding it (e.g. closing the modal without saving). */
  onDirtyChange?: (dirty: boolean) => void
}

/**
 * Compares the whole draft tree rather than enumerating content fields. Line ids
 * are stripped because a fresh one is minted on every commit, which would
 * otherwise leave the form permanently "dirty" after a commit-then-remove even
 * though it looks empty. Enumerating fields instead is what let the focused-card
 * trial discard a notes-only draft without asking.
 */
function snapshot(groups: EntryGroupDraft[]): string {
  return JSON.stringify(groups, (key: string, value: unknown) => (key === 'id' ? undefined : value))
}

export function GroupedTransactionForm({
  model,
  actions,
  onClose,
  hidden,
  onDirtyChange,
}: GroupedTransactionFormProps) {
  const format = useMoneyFormat()
  const { showToast } = useToast()

  const makeLine = (
    categoryId: number,
    accountId: number,
    type: GroupLineDraft['type'] = 'expense',
  ): GroupLineDraft => ({
    id: crypto.randomUUID(),
    type,
    amount: '',
    description: '',
    categoryId,
    accountId,
  })

  const [groups, setGroups] = useState<EntryGroupDraft[]>(() => {
    const categoryId = model.dataset.categories.find((c) => c.active)?.id ?? model.dataset.categories[0]?.id ?? 0
    const accountId = resolveDefaultAccountId(model.dataset.accounts, model.dataset.settings)
    return [
      {
        id: crypto.randomUUID(),
        date: todayIso(),
        categoryId,
        accountId,
        type: 'expense',
        lines: [],
        draft: makeLine(categoryId, accountId),
      },
    ]
  })
  const [activeGroupId, setActiveGroupId] = useState(() => groups[0]?.id ?? '')
  const [expandedLineId, setExpandedLineId] = useState<string | null>(null)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)

  // Bumped whenever focus should return to the active group's Amount field.
  // A counter rather than a boolean so repeated commits each re-trigger it, and
  // guarded at 0 so it never fires on mount and fights Modal's own initial focus.
  const [focusToken, setFocusToken] = useState(0)
  const amountRef = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (focusToken > 0) amountRef.current?.focus()
  }, [focusToken])

  const initialSnapshot = useRef(snapshot(groups))
  useEffect(() => {
    onDirtyChange?.(snapshot(groups) !== initialSnapshot.current)
    // onDirtyChange intentionally omitted: callers pass a state setter inline, which
    // would otherwise re-run this on every parent render regardless of `groups`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groups])

  /** Drops a line's stale error the moment it is edited, so a fixed value stops
   * showing last save's message; save() re-flags it if it is still bad. */
  const clearError = (lineId: string) =>
    setErrors((e) => {
      if (!(lineId in e)) return e
      const next = { ...e }
      delete next[lineId]
      return next
    })

  const patchGroup = (groupId: string, patch: (g: EntryGroupDraft) => EntryGroupDraft) =>
    setGroups((gs) => gs.map((g) => (g.id === groupId ? patch(g) : g)))

  const setDraft = (groupId: string, patch: Partial<GroupLineDraft>) => {
    patchGroup(groupId, (g) => ({ ...g, draft: { ...g.draft, ...patch } }))
    const group = groups.find((g) => g.id === groupId)
    if (group) clearError(group.draft.id)
  }

  const setLine = (groupId: string, lineId: string, patch: Partial<GroupLineDraft>) => {
    patchGroup(groupId, (g) => ({
      ...g,
      lines: g.lines.map((l) => (l.id === lineId ? { ...l, ...patch } : l)),
    }))
    clearError(lineId)
  }

  const setGroupDefaults = (groupId: string, patch: Parameters<typeof applyGroupDefaults>[1]) =>
    patchGroup(groupId, (g) => applyGroupDefaults(g, patch))

  const removeLine = (groupId: string, lineId: string) => {
    patchGroup(groupId, (g) => ({ ...g, lines: g.lines.filter((l) => l.id !== lineId) }))
    clearError(lineId)
    setExpandedLineId((id) => (id === lineId ? null : id))
  }

  const commitDraft = (groupId: string) => {
    const group = groups.find((g) => g.id === groupId)
    if (!group) return
    // A stray Enter on an untouched strip must never file an empty line.
    if (isLineEmpty(group.draft)) return
    const message = lineError(group.draft, format)
    if (message) {
      setErrors((e) => ({ ...e, [group.draft.id]: message }))
      setFocusToken((t) => t + 1)
      return
    }
    patchGroup(groupId, (g) => ({
      ...g,
      lines: [...g.lines, g.draft],
      draft: makeLine(g.draft.categoryId, g.draft.accountId, g.draft.type),
    }))
    setFocusToken((t) => t + 1)
  }

  const addGroup = () => {
    const seed = nextGroupSeed(groups, model.dataset.categories)
    if (!seed) return
    const group: EntryGroupDraft = {
      id: crypto.randomUUID(),
      ...seed,
      lines: [],
      draft: makeLine(seed.categoryId, seed.accountId, seed.type),
    }
    setGroups((gs) => [...gs, group])
    setActiveGroupId(group.id)
    setExpandedLineId(null)
    setFocusToken((t) => t + 1)
  }

  const removeGroup = (groupId: string) =>
    setGroups((gs) => {
      if (gs.length <= 1) return gs
      const next = gs.filter((g) => g.id !== groupId)
      setActiveGroupId((id) => (id === groupId ? (next[next.length - 1]?.id ?? '') : id))
      return next
    })

  const activateGroup = (groupId: string) => {
    setActiveGroupId(groupId)
    setExpandedLineId(null)
    setFocusToken((t) => t + 1)
  }

  const { count, totalCents } = groupTotals(groups, format)

  const save = async () => {
    const result = buildGroupedTransactions(groups, format, model.dataset.settings.budgetRolloverDay)
    if (!result.ok) {
      setErrors(result.errors)
      const firstBadId = Object.keys(result.errors)[0]
      if (firstBadId) {
        // Open the offending line so its message is on screen rather than
        // collapsed inside a one-liner the user has to go hunting for.
        const owner = groups.find((g) => g.lines.some((l) => l.id === firstBadId))
        if (owner) {
          setExpandedLineId(firstBadId)
          setActiveGroupId(owner.id)
        }
      } else {
        showToast('Add at least one transaction', 'error')
      }
      return
    }
    setErrors({})
    setBusy(true)
    try {
      await actions.createTransactions(result.transactions)
      showToast(
        `Added ${result.transactions.length} transaction${result.transactions.length === 1 ? '' : 's'}`,
        'success',
      )
      onClose()
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Could not save', 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className={styles.root} hidden={hidden} data-testid="grouped-transaction-form">
      {groups.map((group) => (
        <EntryGroupCard
          key={group.id}
          group={group}
          model={model}
          isActive={group.id === activeGroupId}
          canRemove={groups.length > 1}
          errors={errors}
          expandedLineId={expandedLineId}
          amountRef={amountRef}
          onActivate={() => activateGroup(group.id)}
          onDefaultsChange={(patch) => setGroupDefaults(group.id, patch)}
          onDraftChange={(patch) => setDraft(group.id, patch)}
          onCommit={() => commitDraft(group.id)}
          onLineChange={(lineId, patch) => setLine(group.id, lineId, patch)}
          onLineRemove={(lineId) => removeLine(group.id, lineId)}
          onLineToggle={(lineId) => setExpandedLineId((id) => (id === lineId ? null : lineId))}
          onRemoveGroup={() => removeGroup(group.id)}
        />
      ))}

      <button type="button" className={styles.addGroup} onClick={addGroup}>
        <PlusIcon /> Add another group
      </button>

      <p className={styles.summary} data-testid="grouped-summary">
        {count} transaction{count === 1 ? '' : 's'} · <Money cents={totalCents} />
      </p>

      <div className={formStyles.actions}>
        <button
          type="button"
          className={`${formStyles.save} tapActive`}
          disabled={busy}
          onClick={() => void save()}
        >
          {busy ? 'Saving…' : `Add ${count} transaction${count === 1 ? '' : 's'}`}
        </button>
      </div>
    </div>
  )
}
