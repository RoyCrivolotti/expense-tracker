import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { Flag } from '../../types'
import { makeFlag } from '../../testing/factories'
import { CategoryAccountRow, StatusTypeRow } from './TxnFilterRows'

const work = makeFlag({ id: 1, name: 'Work travel' })
const archived = makeFlag({ id: 2, name: 'Old claim', active: false })

function renderRow(overrides: { flags?: Flag[]; flagId?: number | 'all' | 'none'; selectMode?: boolean } = {}) {
  const onFlag = vi.fn()
  const { flags = [work], flagId = 'all' as const, selectMode = false } = overrides
  render(
    <StatusTypeRow
      flags={flags}
      flagId={flagId}
      onFlag={onFlag}
      status="all"
      txnType="all"
      selectMode={selectMode}
      onStatus={vi.fn()}
      onTxnType={vi.fn()}
    />,
  )
  return { onFlag }
}

describe('StatusTypeRow flag select', () => {
  it('offers all flags, unflagged, and each active flag', () => {
    renderRow()
    const select = screen.getByRole('combobox', { name: 'Filter by flag' })

    expect([...select.querySelectorAll('option')].map((o) => o.textContent)).toEqual([
      'Flag',
      'Unflagged',
      'Work travel',
    ])
  })

  it('reports a chosen flag as a number, not a string', async () => {
    const { onFlag } = renderRow()

    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Filter by flag' }), '1')

    expect(onFlag).toHaveBeenCalledWith(1)
  })

  it('passes the unflagged sentinel through as-is', async () => {
    const { onFlag } = renderRow()

    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Filter by flag' }), 'none')

    expect(onFlag).toHaveBeenCalledWith('none')
  })

  it('hides archived flags', () => {
    renderRow({ flags: [work, archived] })

    expect(screen.queryByRole('option', { name: /Old claim/ })).not.toBeInTheDocument()
  })

  it('keeps an archived flag listed while it is the active filter', () => {
    renderRow({ flags: [work, archived], flagId: 2 })

    expect(screen.getByRole('option', { name: 'Old claim (archived)' })).toBeInTheDocument()
  })

  it('is disabled in select mode, like the other filters', () => {
    renderRow({ selectMode: true })

    expect(screen.getByRole('combobox', { name: 'Filter by flag' })).toBeDisabled()
  })

  it('omits the flag select when flags array is empty', () => {
    renderRow({ flags: [] })

    expect(screen.queryByRole('combobox', { name: 'Filter by flag' })).not.toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'Status' })).toBeInTheDocument()
  })
})

describe('filter selects keep their meaning without the "All" prefix', () => {
  // The unfiltered option now reads "Status" rather than "All statuses", so once a value
  // is chosen the visible text is just "Posted". The accessible name is what still says
  // which filter this is.
  it('names status and type by the filter they apply', () => {
    renderRow()
    expect(screen.getByRole('combobox', { name: 'Filter by status' })).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: 'Filter by type' })).toBeInTheDocument()
  })

  it('names category and account the same way', () => {
    render(
      <CategoryAccountRow
        categories={[]}
        accounts={[]}
        categoryId="all"
        accountId="all"
        selectMode={false}
        onCategory={vi.fn()}
        onAccount={vi.fn()}
      />,
    )
    expect(screen.getByRole('combobox', { name: 'Filter by category' })).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: 'Filter by account' })).toBeInTheDocument()
  })

  it('shows the one-word default when nothing is chosen', () => {
    renderRow()
    expect(screen.getByRole('combobox', { name: 'Filter by status' })).toHaveDisplayValue('Status')
    expect(screen.getByRole('combobox', { name: 'Filter by type' })).toHaveDisplayValue('Type')
    expect(screen.getByRole('combobox', { name: 'Filter by flag' })).toHaveDisplayValue('Flag')
  })
})
