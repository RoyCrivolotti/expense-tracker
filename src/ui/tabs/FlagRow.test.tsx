import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { Flag } from '../../types'
import { makeFlag, makeLabel } from '../../testing/factories'
import { PrimaryFilterRow, SecondaryFilterRow } from './TxnFilterRows'

const work = makeFlag({ id: 1, name: 'Work travel' })
const archived = makeFlag({ id: 2, name: 'Old claim', active: false })
const travel = makeLabel({ id: 1, name: 'Travel' })

function renderRow(overrides: { flags?: Flag[]; flagId?: number | 'all' | 'none'; selectMode?: boolean } = {}) {
  const onFlag = vi.fn()
  const { flags = [work], flagId = 'all' as const, selectMode = false } = overrides
  render(
    <SecondaryFilterRow
      flags={flags}
      flagId={flagId}
      onFlag={onFlag}
      status="all"
      selectMode={selectMode}
      onStatus={vi.fn()}
      labels={[]}
      labelIds={[]}
      onLabelIds={vi.fn()}
    />,
  )
  return { onFlag }
}

describe('SecondaryFilterRow flag select', () => {
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
  it('names status by the filter it applies', () => {
    renderRow()
    expect(screen.getByRole('combobox', { name: 'Filter by status' })).toBeInTheDocument()
  })

  it('reports a chosen status', async () => {
    const onStatus = vi.fn()
    render(
      <SecondaryFilterRow
        flags={[work]}
        flagId="all"
        onFlag={vi.fn()}
        status="all"
        selectMode={false}
        onStatus={onStatus}
        labels={[]}
        labelIds={[]}
        onLabelIds={vi.fn()}
      />,
    )

    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Filter by status' }), 'posted')

    expect(onStatus).toHaveBeenCalledWith('posted')
  })

  it('reports a chosen type', async () => {
    const onTxnType = vi.fn()
    render(
      <PrimaryFilterRow
        categories={[]}
        accounts={[]}
        categoryId="all"
        accountId="all"
        txnType="all"
        selectMode={false}
        onCategory={vi.fn()}
        onAccount={vi.fn()}
        onTxnType={onTxnType}
      />,
    )

    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Filter by type' }), 'refund')

    expect(onTxnType).toHaveBeenCalledWith('refund')
  })

  it('names category, type and account the same way', () => {
    render(
      <PrimaryFilterRow
        categories={[]}
        accounts={[]}
        categoryId="all"
        accountId="all"
        txnType="all"
        selectMode={false}
        onCategory={vi.fn()}
        onAccount={vi.fn()}
        onTxnType={vi.fn()}
      />,
    )
    expect(screen.getByRole('combobox', { name: 'Filter by category' })).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: 'Filter by type' })).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: 'Filter by account' })).toBeInTheDocument()
  })

  it('shows the one-word default when nothing is chosen', () => {
    renderRow()
    expect(screen.getByRole('combobox', { name: 'Filter by status' })).toHaveDisplayValue('Status')
    expect(screen.getByRole('combobox', { name: 'Filter by flag' })).toHaveDisplayValue('Flag')
  })
})

describe('filter row DOM order', () => {
  // The two rows were restructured from three separate rows into aligned
  // three-column grids specifically so Category/Type/Account and
  // Status/Flag/Label would line up visually. A test that only checks each
  // control exists somewhere would pass even if the visual order regressed
  // (e.g. two fields transposed), so this asserts the actual DOM sequence.
  it('renders PrimaryFilterRow as Category, then Type, then Account', () => {
    const { container } = render(
      <PrimaryFilterRow
        categories={[]}
        accounts={[]}
        categoryId="all"
        accountId="all"
        txnType="all"
        selectMode={false}
        onCategory={vi.fn()}
        onAccount={vi.fn()}
        onTxnType={vi.fn()}
      />,
    )

    const names = [...container.querySelectorAll('select')].map((el) => el.getAttribute('aria-label'))

    expect(names).toEqual(['Filter by category', 'Filter by type', 'Filter by account'])
  })

  it('renders SecondaryFilterRow as Status, then Flag, then Label', () => {
    const { container } = render(
      <SecondaryFilterRow
        flags={[work]}
        flagId="all"
        onFlag={vi.fn()}
        status="all"
        selectMode={false}
        onStatus={vi.fn()}
        labels={[travel]}
        labelIds={[]}
        onLabelIds={vi.fn()}
      />,
    )

    const names = [...container.querySelectorAll('select, button[aria-haspopup="dialog"]')].map((el) =>
      el.tagName === 'SELECT' ? el.getAttribute('aria-label') : 'Label',
    )

    expect(names).toEqual(['Filter by status', 'Filter by flag', 'Label'])
  })

  it('keeps Status before Label when the flag select has nothing to show', () => {
    const { container } = render(
      <SecondaryFilterRow
        flags={[]}
        flagId="all"
        onFlag={vi.fn()}
        status="all"
        selectMode={false}
        onStatus={vi.fn()}
        labels={[travel]}
        labelIds={[]}
        onLabelIds={vi.fn()}
      />,
    )

    expect(screen.queryByRole('combobox', { name: 'Filter by flag' })).not.toBeInTheDocument()

    const names = [...container.querySelectorAll('select, button[aria-haspopup="dialog"]')].map((el) =>
      el.tagName === 'SELECT' ? el.getAttribute('aria-label') : 'Label',
    )

    expect(names).toEqual(['Filter by status', 'Label'])
  })
})
