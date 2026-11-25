import { Suspense } from 'react'
import type { ExpenseDataSource } from '../../data/dataSource'
import type { ExpenseDataset } from '../../types'
import { useAccountOwner } from '../hooks/accountOwner'
import { EXIT_MS } from '../hooks/motion'
import { patchAfterSettings } from '../referencePatches'
import { skipOnboarding } from '../onboarding/onboardingStorage'
import { Presence } from './Presence'
import { ChunkedOnboardingWizard } from './onboardingChunk'

interface Props {
  open: boolean
  source: ExpenseDataSource
  dataset: ExpenseDataset
  /**
   * True only when this run auto-opened because the tenant had no categories
   * or accounts yet — false for a deliberate re-entry from Settings. Only a
   * genuine first-run completion should drop the user straight into "add a
   * transaction"; re-entry is usually just a currency/account tweak.
   */
  firstRun: boolean
  onAdd: () => void
  onClose: () => void
  applyPatch: (patch: (dataset: ExpenseDataset) => ExpenseDataset) => void
}

/** Writes the empty tip list for a person who has just left their first run. A failure leaves them without tips, which is harmless. */
async function startTips(
  source: ExpenseDataSource,
  applyPatch: Props['applyPatch'],
): Promise<void> {
  try {
    const settings = await source.updateSettings?.({ tipsSeen: [] })
    if (settings) applyPatch((d) => patchAfterSettings(d, settings, ['tipsSeen']))
  } catch {
    /* nothing to undo, and nothing the person could do about it */
  }
}

export function ExpensesOnboarding({ open, source, dataset, firstRun, applyPatch, onAdd, onClose }: Props) {
  const owner = useAccountOwner()
  return (
    <Presence show={open} exitMs={EXIT_MS.sheet}>
      {/* No fallback: the box (and its scrim) mounts when the chunk arrives, so it still enters with its own motion. */}
      <Suspense fallback={null}>
        <ChunkedOnboardingWizard
          source={source}
          dataset={dataset}
          applyPatch={applyPatch}
          firstRun={firstRun}
          onDone={() => {
            onClose()
            if (firstRun) onAdd()
          }}
          onSkip={() => {
            skipOnboarding(owner)
            // Leaving the first run is as much "a new person" as finishing it: without the empty list the tips would
            // never show, because the first payment would make the account look established.
            if (firstRun) void startTips(source, applyPatch)
            onClose()
          }}
        />
      </Suspense>
    </Presence>
  )
}
