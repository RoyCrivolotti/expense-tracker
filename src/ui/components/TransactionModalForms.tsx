import type { Transaction } from '../../types'
import type { ExpenseActions, TransactionSeed } from '../actions'
import type { ExpenseModel } from '../useExpenseData'
import { exitVars } from '../hooks/motion'
import { QueuePager } from './QueuePager'
import { useToast } from '../hooks/useToast'
import { TransactionForm } from './TransactionForm'
import type { PageMove, ReviewSheet } from './reviewPages'
import { formKeyOf, useQueueAdvance } from './transactionModalQueue'
import { deleteWithToast } from './transactionModalState'
import styles from './QueuePager.module.css'

/** What every form in the modal is given, whichever payment it is for. */
export interface FormShared {
  model: ExpenseModel
  actions: ExpenseActions
  editing: Transaction | null
  onClose: () => void
  view: 'fields' | 'installment'
  onViewChange: (view: 'fields' | 'installment') => void
  onTrapPausedChange: (paused: boolean) => void
  onPartialSaveChange: (stranded: number) => void
}

/** The single form for one transaction or one payment, with what it does once it has saved. */
export function SeedForm({
  seed,
  hidden,
  shown = true,
  onDirtyChange,
  onBusyChange,
  ...form
}: FormShared & {
  seed: TransactionSeed | undefined
  hidden: boolean
  /** False for a payment's form kept behind the one on screen. */
  shown?: boolean
  onDirtyChange: (dirty: boolean) => void
  onBusyChange?: ((busy: boolean) => void) | undefined
}) {
  const { model, actions, editing, onClose } = form
  const { showToast } = useToast()
  /**
   * Resolves with the stored row on create so the form can upload the receipts
   * staged against it, and null on update where the id was already known.
   *
   * Deliberately does not toast: receipts upload *after* this resolves, and a
   * premature "Transaction added" would be replaced by any failure message —
   * ToastProvider holds one message at a time. TransactionForm toasts once
   * everything has landed, the way BatchTransactionForm already does.
   */
  const queue = useQueueAdvance(seed, actions, onClose, shown)
  return (
    <TransactionForm
      model={model}
      editing={editing}
      seed={seed}
      duplicate={queue.duplicate}
      onSubmit={queue.submit}
      onDelete={deleteWithToast(actions, showToast)}
      onDuplicate={actions.onDuplicate}
      onClose={queue.finish}
      queue={queue.forForm}
      hidden={hidden}
      onDirtyChange={onDirtyChange}
      onPartialSaveChange={form.onPartialSaveChange}
      onTrapPausedChange={form.onTrapPausedChange}
      onBusyChange={onBusyChange}
      actions={actions}
      view={form.view}
      onViewChange={form.onViewChange}
    />
  )
}

function pageClass(move: PageMove | null): string {
  if (!move || move.phase === 'held') return styles.page!
  return `${styles.page} ${move.phase === 'out' ? styles.pageOut : styles.pageIn}`
}

/**
 * The forms of every payment the review sheet has shown, the one on screen visible and the others kept as they were
 * left. A payment leaving under an arrow takes no taps or keys on its way out.
 */
export function ReviewForms({
  review,
  move,
  form,
}: {
  review: NonNullable<ReviewSheet['review']>
  move: ReviewSheet['move']
  form: FormShared
}) {
  const leaving = move.move?.phase === 'out'
  return (
    <div
      className={pageClass(move.move)}
      data-dir={move.move?.dir}
      inert={leaving}
      style={exitVars(leaving, move.exitMs)}
      onAnimationEnd={(e) => {
        if (e.target === e.currentTarget && move.move?.phase === 'in') move.arrived()
      }}
    >
      {review.pages.map((page) => (
        <SeedForm
          key={page.key}
          {...form}
          seed={page.seed}
          hidden={page.key !== review.shown}
          shown={page.key === review.shown}
          onDirtyChange={(dirty) => review.setDirty(page.key, dirty)}
          onBusyChange={(busy) => review.setBusy(page.key, busy)}
        />
      ))}
    </div>
  )
}

/** The modal's form: one per payment shown while working through captured payments, or the one form otherwise. */
export function ModalForms({
  sheet,
  seed,
  hidden,
  onDirtyChange,
  form,
}: {
  sheet: ReviewSheet
  seed: TransactionSeed | undefined
  hidden: boolean
  onDirtyChange: (dirty: boolean) => void
  form: FormShared
}) {
  if (sheet.review) return <ReviewForms review={sheet.review} move={sheet.move} form={form} />
  return (
    <SeedForm
      /*
       * Keyed on the row being edited, so following a link from inside the
       * editor to another transaction rebuilds the form. `initialFields` runs
       * in a `useState` initialiser, so without this the fields kept showing
       * the transaction you came *from* while the header and links described
       * the one you had just opened.
       */
      key={formKeyOf(form.editing, seed)}
      {...form}
      seed={seed}
      hidden={hidden}
      onDirtyChange={onDirtyChange}
    />
  )
}

/**
 * The review sheet's pager, for the header. Not on the installment step, a sub-page with its own title and back arrow.
 * It waits while a picker is open, which belongs to the payment on screen and closes before the sheet moves on.
 */
export function SheetPager({
  sheet,
  seed,
  view,
  pickerOpen,
}: {
  sheet: ReviewSheet
  seed: TransactionSeed | undefined
  view: 'fields' | 'installment'
  pickerOpen: boolean
}) {
  if (!sheet.review || !seed?.queue || view !== 'fields') return null
  return <QueuePager queue={seed.queue} busy={sheet.review.busy || pickerOpen} onMove={sheet.move.go} />
}
