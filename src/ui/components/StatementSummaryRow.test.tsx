import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { StatementSummaryRow } from './StatementSummaryRow'
import styles from './StatementSummaryRow.module.css'

const CHARGE = 137_345

describe('StatementSummaryRow', () => {
  it('says Due, in the due tone, for an unpaid statement with a charge', () => {
    render(<StatementSummaryRow name="Iberia Icon" amountCents={CHARGE} paid={false} />)

    expect(screen.getByText('Due').className).toContain(styles.due!)
  })

  it('says when a statement was paid, in the paid tone', () => {
    render(
      <StatementSummaryRow name="Iberia Icon" amountCents={CHARGE} paid paidOn="2026-06-15" />,
    )

    const status = screen.getByText('Paid · 15 Jun')
    expect(status.className).toContain(styles.paid!)
    expect(status.className).not.toContain(styles.due!)
  })

  it('says Paid without a date when an older statement has none', () => {
    render(<StatementSummaryRow name="Iberia Icon" amountCents={CHARGE} paid />)

    expect(screen.getByText('Paid')).toBeInTheDocument()
  })

  it('has no tone when there is nothing to settle', () => {
    render(<StatementSummaryRow name="Iberia Icon" amountCents={0} paid={false} />)

    const status = screen.getByText('Nothing to settle')
    expect(status.className).not.toContain(styles.due!)
    expect(status.className).not.toContain(styles.paid!)
  })

  it('puts the subtitle before the status', () => {
    render(
      <StatementSummaryRow
        name="Iberia Icon statement"
        subtitle="June 2026"
        amountCents={CHARGE}
        paid
        paidOn="2026-06-15"
      />,
    )

    expect(screen.getByText(/June 2026/)).toHaveTextContent('June 2026 · Paid · 15 Jun')
  })

  it('is a button named by what it shows, status and amount included', () => {
    render(
      <StatementSummaryRow
        name="Iberia Icon"
        amountCents={CHARGE}
        paid={false}
        onPress={vi.fn()}
      />,
    )

    const name = screen.getByRole('button').textContent
    expect(screen.getByRole('button', { name: /^Iberia Icon Due/ })).toBeInTheDocument()
    expect(name).toContain('1.373,45')
  })

  it('is plain content, not a button, when it cannot be pressed', () => {
    render(<StatementSummaryRow name="Iberia Icon" amountCents={CHARGE} paid={false} />)

    expect(screen.queryByRole('button')).not.toBeInTheDocument()
    expect(screen.getByText('Iberia Icon')).toBeInTheDocument()
  })
})
