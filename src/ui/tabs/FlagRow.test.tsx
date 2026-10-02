import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { Flag } from '../../types'
import { makeFlag, makeLabel } from '../../testing/factories'
import type { Label } from '../../types'
import { FilterFields } from './TxnFilterRows'

const work = makeFlag({ id: 1, name: 'Work travel' })
const archived = makeFlag({ id: 2, name: 'Old claim', active: false })

function renderFields(
  overrides: {
    flags?: Flag[]
    flagId?: number | 'all' | 'none'
    labels?: Label[]
    selectMode?: boolean
  } = {},
) {
  const onFlag = vi.fn()
  const onStatus = vi.fn()
  const onTxnType = vi.fn()
  const { flags = [work], flagId = 'all' as const, labels = [], selectMode = false } = overrides
  const view = render(
    <FilterFields
      categories={[]}
      accounts={[]}
      flags={flags}
      labels={labels}
      categoryId="all"
      accountId="all"
      txnType="all"
      status="all"
      flagId={flagId}
      labelIds={[]}
      selectMode={selectMode}
      onCategory={vi.fn()}
      onAccount={vi.fn()}
      onTxnType={onTxnType}
      onStatus={onStatus}
      onFlag={onFlag}
      onLabelIds={vi.fn()}
    />,
  )
  return { onFlag, onStatus, onTxnType, container: view.container }
}

describe('FilterFields flag select', () => {
  it('offers all flags, unflagged, and each active flag', () => {
    renderFields()
    const select = screen.getByRole('combobox', { name: 'Filter by flag' })

    expect([...select.querySelectorAll('option')].map((o) => o.textContent)).toEqual([
      'Flag',
      'Unflagged',
      'Work travel',
    ])
  })

  it('reports a chosen flag as a number, not a string', async () => {
    const { onFlag } = renderFields()

    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Filter by flag' }), '1')

    expect(onFlag).toHaveBeenCalledWith(1)
  })

  it('passes the unflagged sentinel through as-is', async () => {
    const { onFlag } = renderFields()

    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Filter by flag' }), 'none')

    expect(onFlag).toHaveBeenCalledWith('none')
  })

  it('hides archived flags', () => {
    renderFields({ flags: [work, archived] })

    expect(screen.queryByRole('option', { name: /Old claim/ })).not.toBeInTheDocument()
  })

  it('keeps an archived flag listed while it is the active filter', () => {
    renderFields({ flags: [work, archived], flagId: 2 })

    expect(screen.getByRole('option', { name: 'Old claim (archived)' })).toBeInTheDocument()
  })

  it('is disabled in select mode, like the other filters', () => {
    renderFields({ selectMode: true })

    expect(screen.getByRole('combobox', { name: 'Filter by flag' })).toBeDisabled()
  })

  it('omits the flag select when flags array is empty', () => {
    renderFields({ flags: [] })

    expect(screen.queryByRole('combobox', { name: 'Filter by flag' })).not.toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'Status' })).toBeInTheDocument()
  })
})

describe('filter selects keep their meaning without the "All" prefix', () => {
  // The unfiltered option now reads "Status" rather than "All statuses", so once a value
  // is chosen the visible text is just "Posted". The accessible name is what still says
  // which filter this is.
  it('names status and type by the filter they apply', () => {
    renderFields()
    expect(screen.getByRole('combobox', { name: 'Filter by status' })).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: 'Filter by type' })).toBeInTheDocument()
  })

  it('names category and account the same way', () => {
    renderFields()
    expect(screen.getByRole('combobox', { name: 'Filter by category' })).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: 'Filter by account' })).toBeInTheDocument()
  })

  it('reports a chosen status and a chosen type', async () => {
    const { onStatus, onTxnType } = renderFields()

    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Filter by status' }), 'posted')
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Filter by type' }), 'refund')

    expect(onStatus).toHaveBeenCalledWith('posted')
    expect(onTxnType).toHaveBeenCalledWith('refund')
  })

  it('shows the one-word default when nothing is chosen', () => {
    renderFields()
    expect(screen.getByRole('combobox', { name: 'Filter by status' })).toHaveDisplayValue('Status')
    expect(screen.getByRole('combobox', { name: 'Filter by type' })).toHaveDisplayValue('Type')
    expect(screen.getByRole('combobox', { name: 'Filter by flag' })).toHaveDisplayValue('Flag')
  })
})

describe('FilterFields layout', () => {
  const travel = makeLabel({ id: 1, name: 'Travel' })
  const order = (container: HTMLElement) =>
    [...container.querySelectorAll('select, button[aria-haspopup="dialog"]')].map((el) =>
      el.tagName === 'SELECT' ? el.getAttribute('aria-label') : 'Labels',
    )

  it('lays six fields out Category, Account, Type, Status, Flag, Labels in three columns', () => {
    const { container } = renderFields({ labels: [travel] })

    expect(order(container)).toEqual([
      'Filter by category',
      'Filter by account',
      'Filter by type',
      'Filter by status',
      'Filter by flag',
      'Labels',
    ])
    expect(container.firstElementChild).toHaveAttribute('data-columns', '3')
  })

  it('keeps three columns with five fields, so two boxes do not stretch wider than the rest', () => {
    const { container } = renderFields({ flags: [] , labels: [travel] })

    expect(container.firstElementChild).toHaveAttribute('data-columns', '3')
  })

  it('goes two to a row with only the four fields that always exist', () => {
    const { container } = renderFields({ flags: [], labels: [] })

    expect(order(container)).toEqual([
      'Filter by category',
      'Filter by account',
      'Filter by type',
      'Filter by status',
    ])
    expect(container.firstElementChild).toHaveAttribute('data-columns', '2')
  })
})
