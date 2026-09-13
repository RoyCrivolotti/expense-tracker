import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { makeLookup, makeTransaction } from '../../testing/factories'
import { MoneyFormatProvider } from '../hooks/MoneyFormatProvider'
import { ReimbursementLink } from './ReimbursementLink'
import type { Lookup } from '../format'

const payment = makeTransaction({ id: 99, type: 'refund', amountCents: 12_000, date: '2026-06-14' })

function renderLink(editing = makeTransaction({ id: 1 }), lookup: Partial<Lookup> = {}) {
  const onOpen = vi.fn()
  render(
    <MoneyFormatProvider currencyCode="EUR" numberLocale="de-DE">
      <ReimbursementLink editing={editing} lookup={makeLookup(lookup)} onOpen={onOpen} />
    </MoneyFormatProvider>,
  )
  return { onOpen }
}

describe('ReimbursementLink', () => {
  it('tells a claimed expense that it was paid back, and when', async () => {
    const { onOpen } = renderLink(makeTransaction({ id: 1, settledBy: 99 }), {
      settlementFor: () => payment,
    })

    const link = screen.getByRole('button', { name: /Reimbursed/ })
    expect(link).toHaveTextContent('14 Jun')
    expect(link).toHaveTextContent('120,00 €')

    await userEvent.click(link)
    expect(onOpen).toHaveBeenCalledWith(payment)
  })

  it('tells a payment what it covered', () => {
    renderLink(payment, {
      settledBy: () => [makeTransaction({ id: 1 }), makeTransaction({ id: 2, amountCents: 4_000 })],
    })

    expect(screen.getByRole('button', { name: /Reimburses 2 transactions/ })).toHaveTextContent(
      '238,40 €',
    )
  })

  it('names the count in the label, since the button opens only the first', () => {
    // The row it opens is a way in rather than the whole answer.
    renderLink(payment, {
      settledBy: () => [makeTransaction({ id: 1 }), makeTransaction({ id: 2 })],
    })

    expect(
      screen.getByRole('button', { name: 'Reimburses 2 transactions. Open the first.' }),
    ).toBeInTheDocument()
  })

  it('shows nothing for a transaction on neither side of a reimbursement', () => {
    const { container } = render(
      <MoneyFormatProvider currencyCode="EUR" numberLocale="de-DE">
        <ReimbursementLink
          editing={makeTransaction({ id: 1 })}
          lookup={makeLookup()}
          onOpen={vi.fn()}
        />
      </MoneyFormatProvider>,
    )

    expect(container).toBeEmptyDOMElement()
  })
})
