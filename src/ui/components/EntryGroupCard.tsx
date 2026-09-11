import { useRef, type RefObject } from 'react'
import { defaultBudgetMonth, fullMonthLabel, shortMonthYearLabel } from '../../engine/dates'
import { formatDayLabel } from '../format'
import { CloseIcon, PlusIcon } from '../icons'
import { useMoneyFormat } from '../hooks/moneyFormatContext'
import type { ExpenseModel } from '../useExpenseData'
import { applyDescriptionSuggestion } from '../../data/applyDescriptionSuggestion'
import type { EntryGroupDraft, GroupLineDraft } from './groupedTransactionIntent'
import { CommittedLine } from './CommittedLine'
import { DescriptionCombobox } from './DescriptionCombobox'
import { optionLabel, selectableOptions } from './pickerOptions'
import { Field, TypeSelector } from './TransactionFields'
import formStyles from './TransactionForm.module.css'
import styles from './GroupedTransactionForm.module.css'

interface EntryGroupCardProps {
  group: EntryGroupDraft
  model: ExpenseModel
  isActive: boolean
  canRemove: boolean
  errors: Record<string, string>
  expandedLineId: string | null
  amountRef: RefObject<HTMLInputElement | null>
  onActivate: () => void
  onDefaultsChange: (patch: Partial<Pick<EntryGroupDraft, 'date' | 'categoryId' | 'accountId' | 'type'>>) => void
  onDraftChange: (patch: Partial<GroupLineDraft>) => void
  onCommit: () => void
  onLineChange: (lineId: string, patch: Partial<GroupLineDraft>) => void
  onLineRemove: (lineId: string) => void
  onLineToggle: (lineId: string) => void
  onRemoveGroup: () => void
}

export function EntryGroupCard({
  group,
  model,
  isActive,
  canRemove,
  errors,
  expandedLineId,
  amountRef,
  onActivate,
  onDefaultsChange,
  onDraftChange,
  onCommit,
  onLineChange,
  onLineRemove,
  onLineToggle,
  onRemoveGroup,
}: EntryGroupCardProps) {
  const format = useMoneyFormat()
  const descriptionRef = useRef<HTMLInputElement>(null)

  const categoryName =
    model.dataset.categories.find((c) => c.id === group.categoryId)?.name ?? 'Category'
  const budgetMonth = defaultBudgetMonth(group.date, model.dataset.settings.budgetRolloverDay)
  const dayLabel = formatDayLabel(group.date)
  const draftError = errors[group.draft.id]

  // The group is removable only while it holds nothing. A populated group would
  // need a confirm, and a ConfirmSheet rendered from in here runs its own focus
  // trap inside the modal's — the double-trap case useFocusTrap warns about.
  const removable = canRemove && group.lines.length === 0

  const onAcceptSuggestion = (suggestion: Parameters<typeof applyDescriptionSuggestion>[0]) =>
    onDraftChange(
      applyDescriptionSuggestion(suggestion, model.dataset, {
        categoryId: group.draft.categoryId,
        accountId: group.draft.accountId,
      }),
    )

  return (
    <section className={styles.group} aria-label={`${categoryName} on ${dayLabel}`}>
      <div className={styles.groupHeader}>
        <div className={styles.groupHeaderRow}>
          <Field label="Date">
            <input
              type="date"
              value={group.date}
              onChange={(e) => onDefaultsChange({ date: e.target.value })}
              required
            />
          </Field>
          <Field label="Category">
            <select
              value={group.categoryId}
              onChange={(e) => onDefaultsChange({ categoryId: Number(e.target.value) })}
            >
              {selectableOptions(model.dataset.categories, group.categoryId).map((c) => (
                <option key={c.id} value={c.id}>
                  {optionLabel(c)}
                </option>
              ))}
            </select>
          </Field>
          {removable && (
            <button
              type="button"
              className={styles.removeGroup}
              aria-label={`Remove ${categoryName} on ${dayLabel}`}
              onClick={onRemoveGroup}
            >
              <CloseIcon />
            </button>
          )}
        </div>

        <div className={styles.defaultsRow}>
          <TypeSelector value={group.type} onChange={(t) => onDefaultsChange({ type: t })} />
          <Field label="Account">
            <select
              value={group.accountId}
              onChange={(e) => onDefaultsChange({ accountId: Number(e.target.value) })}
            >
              {selectableOptions(model.dataset.accounts, group.accountId).map((a) => (
                <option key={a.id} value={a.id}>
                  {optionLabel(a)}
                </option>
              ))}
            </select>
          </Field>
        </div>

        <div className={styles.groupMeta}>
          <span className={styles.budgetPill} title={fullMonthLabel(budgetMonth)}>
            {shortMonthYearLabel(budgetMonth)}
          </span>
        </div>
      </div>

      {group.lines.length > 0 && (
        <ul className={styles.lines}>
          {group.lines.map((line) => (
            <CommittedLine
              key={line.id}
              line={line}
              model={model}
              expanded={expandedLineId === line.id}
              error={errors[line.id]}
              onToggle={() => onLineToggle(line.id)}
              onChange={(patch) => onLineChange(line.id, patch)}
              onRemove={() => onLineRemove(line.id)}
            />
          ))}
        </ul>
      )}

      {isActive ? (
        <div className={styles.strip} data-testid="entry-strip">
          <div className={styles.stripAmount}>
            <Field label={`Amount (${format.symbol})`}>
              <input
                ref={amountRef}
                type="text"
                inputMode="decimal"
                autoComplete="off"
                enterKeyHint="next"
                placeholder={`0${format.decimalSeparator}00`}
                value={group.draft.amount}
                onChange={(e) => onDraftChange({ amount: e.target.value })}
                onKeyDown={(e) => {
                  // Amount is never the last field, so Enter always advances.
                  // preventDefault is defensive — the root is a div, not a form.
                  if (e.key !== 'Enter') return
                  e.preventDefault()
                  descriptionRef.current?.focus()
                }}
              />
            </Field>
          </div>
          <div className={styles.stripDescription}>
            <Field label="Description">
              <DescriptionCombobox
                value={group.draft.description}
                index={model.descriptionIndex}
                placeholder="e.g. Mercadona"
                enterKeyHint="done"
                inputRef={descriptionRef}
                onChange={(v) => onDraftChange({ description: v })}
                onAccept={onAcceptSuggestion}
                onEnter={onCommit}
              />
            </Field>
          </div>
          <button
            type="button"
            className={`${styles.commit} tapActive`}
            aria-label={`Add line to ${categoryName}`}
            onClick={onCommit}
          >
            <PlusIcon />
          </button>
        </div>
      ) : (
        <button type="button" className={styles.activate} onClick={onActivate}>
          <PlusIcon /> Add to {categoryName}
        </button>
      )}

      {draftError && <p className={formStyles.error}>{draftError}</p>}
    </section>
  )
}
