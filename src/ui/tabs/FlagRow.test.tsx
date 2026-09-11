import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { makeFlag } from '../../testing/factories'
import { FlagRow } from './TxnFilterRows'

const work = makeFlag({ id: 1, name: 'Work travel' })
const archived = makeFlag({ id: 2, name: 'Old claim', active: false })

function renderRow(props: Partial<Parameters<typeof FlagRow>[0]> = {}) {
  const onFlag = vi.fn()
  render(
    <FlagRow flags={[work]} flagId="all" selectMode={false} onFlag={onFlag} {...props} />,
  )
  return { onFlag }
}

describe('FlagRow', () => {
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
})
