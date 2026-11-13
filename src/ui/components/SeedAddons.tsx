import { Suspense, lazy } from 'react'
import type { TransactionSeed } from '../actions'
import type { ExpenseModel } from '../useExpenseData'
import { ChunkBoundary } from './ChunkBoundary'
import { SeedNotice } from './SeedNotice'
import type { FormFields, Setter } from './transactionFormState'

// The question about a card is only for captured payments, so it is not part of the form's own code.
const CardQuestion = lazy(() => import('../capture/CardQuestion'))

interface SeedAddonsProps {
  seed: TransactionSeed | undefined
  form: FormFields
  set: Setter
  model: ExpenseModel
  onDate: (date: string) => void
}

/** What a captured payment adds to the form: the note under the date, and the question about its card. */
export function SeedAddons({ seed, form, set, model, onDate }: SeedAddonsProps) {
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
    </>
  )
}
