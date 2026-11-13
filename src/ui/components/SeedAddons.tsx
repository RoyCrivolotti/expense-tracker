import { Suspense, lazy } from 'react'
import type { DuplicateOffer, TransactionSeed } from '../actions'
import type { ExpenseModel } from '../useExpenseData'
import { ChunkBoundary } from './ChunkBoundary'
import { SeedNotice } from './SeedNotice'
import type { FormFields, Setter } from './transactionFormState'

// The question about a card is only for captured payments, so it is not part of the form's own code.
const CardQuestion = lazy(() => import('../capture/CardQuestion'))
const DuplicateNotice = lazy(() => import('../capture/DuplicateNotice'))

interface SeedAddonsProps {
  seed: TransactionSeed | undefined
  form: FormFields
  set: Setter
  model: ExpenseModel
  onDate: (date: string) => void
  duplicate?: DuplicateOffer | undefined
}

/** What a captured payment adds to the form: the note under the date, the question about its card, and the offer to link a typed row it may duplicate. */
export function SeedAddons({ seed, form, set, model, onDate, duplicate }: SeedAddonsProps) {
  return (
    <>
      {seed?.notice && <SeedNotice notice={seed.notice} date={form.date} onDate={onDate} />}
      {seed?.card && (
        <ChunkBoundary fallback={null}>
          <Suspense fallback={null}>
            <CardQuestion card={seed.card} accounts={model.dataset.accounts} onPick={(id) => set('accountId', id)} />
          </Suspense>
        </ChunkBoundary>
      )}
      {duplicate && (
        <ChunkBoundary fallback={null}>
          <Suspense fallback={null}>
            <DuplicateNotice offer={duplicate} />
          </Suspense>
        </ChunkBoundary>
      )}
    </>
  )
}
