import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { Flag } from '../../types'
import { makeFlag } from '../../testing/factories'
import { StatusTypeRow } from './TxnFilterRows'

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
      'All flags',
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
    expect(screen.getByRole('option', { name: 'All statuses' })).toBeInTheDocument()
  })
})
