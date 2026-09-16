import { render, within } from '@testing-library/react'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { makeDataset, makeTransaction } from '../../testing/factories'
import { buildLookup } from '../format'
import type { ExpenseModel } from '../useExpenseData'
import { TransactionsTab } from './TransactionsTab'
import { RESULTS_ANCHOR_ID } from './scrollToResults'

// useIsMobile reads matchMedia, which jsdom does not implement.
beforeAll(() => {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockReturnValue({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }),
  })
})

function modelFor(transactions: ReturnType<typeof makeTransaction>[]): ExpenseModel {
  const dataset = makeDataset({ transactions })
  return {
    dataset,
    lookup: buildLookup(dataset),
    descriptionIndex: { search: () => [], resolve: () => undefined },
    months: [],
  }
}

/** The item count and net spend, scoped away from a row's own signed amount. */
function summary() {
  return within(document.getElementById(RESULTS_ANCHOR_ID)!)
}

describe('TransactionsTab — result summary', () => {
  it('signs a net refund, so it does not read as spend', () => {
    // netSpendCents is expense minus refund; a lone refund goes negative, which used to
    // render as a plain positive amount — "166,44 €" — indistinguishable from having
    // spent it.
    render(
      <TransactionsTab
        model={modelFor([makeTransaction({ id: 1, type: 'refund', amountCents: 16_644 })])}
        month="2025-01"
      />,
    )

    expect(summary().getByText('−166,44 €')).toBeInTheDocument()
  })

  it('leaves a real net spend unsigned, as before', () => {
    render(
      <TransactionsTab
        model={modelFor([makeTransaction({ id: 1, type: 'expense', amountCents: 34_305 })])}
        month="2025-01"
      />,
    )

    expect(summary().getByText('343,05 €')).toBeInTheDocument()
    expect(summary().queryByText('+343,05 €')).not.toBeInTheDocument()
    expect(summary().queryByText('−343,05 €')).not.toBeInTheDocument()
  })
})
