import { Suspense, lazy } from 'react'
import type { DuplicateOffer, TransactionSeed } from '../actions'
import type { ExpenseModel } from '../useExpenseData'
import { ChunkBoundary } from './ChunkBoundary'
import { SeedNotice } from './SeedNotice'
import type { FormFields, Setter } from './transactionFormState'

// The question about a card is only for captured payments, so it is not part of the form's own code.
const CardQuestion = lazy(() => import('../capture/CardQuestion'))
const DuplicateNotice = lazy(() => import('../capture/DuplicateNotice'))
const SeriesChoice = lazy(() => import('../capture/SeriesChoice'))
const SeedIntro = lazy(() => import('../capture/SeedIntro'))
const SeedNotes = lazy(() => import('../capture/SeedIntro').then((m) => ({ default: m.SeedNotes })))

interface SeedAddonsProps {
  seed: TransactionSeed | undefined
  form: FormFields
  set: Setter
  model: ExpenseModel
  onDate: (date: string) => void
}

/**
 * What a captured payment adds under the form's date: the note about it, which of two monthly series it is, and the
 * question about its card.
 */
export function SeedAddons({ seed, form, set, model, onDate }: SeedAddonsProps) {
  return (
    <>
      {seed?.notice && <SeedNotice notice={seed.notice} date={form.date} onDate={onDate} />}
      {seed?.seriesChoice && (
        <ChunkBoundary fallback={null}>
          <Suspense fallback={null}>
            <SeriesChoice options={seed.seriesChoice} />
          </Suspense>
        </ChunkBoundary>
      )}
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

function Duplicate({ offer, model }: { offer: DuplicateOffer; model: ExpenseModel }) {
  const { accountId } = offer.match
  const account = accountId === undefined ? undefined : model.lookup.account(accountId)
  return (
    <ChunkBoundary fallback={null}>
      <Suspense fallback={null}>
        <DuplicateNotice offer={offer} accountName={account?.name ?? null} />
      </Suspense>
    </ChunkBoundary>
  )
}

/**
 * What a captured payment's form opens with, above its fields: the bank's message and why the payment needs a look,
 * the entry it may duplicate, whether the list found it or the server named it as it refused a save, and the lines
 * about a monthly payment or a foreign amount.
 */
export function SeedOpening({
  seed,
  model,
  duplicate,
}: {
  seed: TransactionSeed | undefined
  model: ExpenseModel
  duplicate?: DuplicateOffer | undefined
}) {
  return (
    <>
      {seed?.intro && (
        <ChunkBoundary fallback={null}>
          <Suspense fallback={null}>
            <SeedIntro intro={seed.intro} duplicate={duplicate !== undefined} />
          </Suspense>
        </ChunkBoundary>
      )}
      {duplicate && <Duplicate offer={duplicate} model={model} />}
      {seed?.intro && seed.intro.notes.length > 0 && (
        <ChunkBoundary fallback={null}>
          <Suspense fallback={null}>
            <SeedNotes intro={seed.intro} />
          </Suspense>
        </ChunkBoundary>
      )}
    </>
  )
}
