import { render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { PagedList } from '../transactionListView'
import { AppVersionSetting } from './AppVersionSetting'

afterEach(() => vi.unstubAllEnvs())

const inParts = { pagedList: {} as PagedList }

describe('AppVersionSetting', () => {
  it('shows the build the app was made from', () => {
    vi.stubEnv('VITE_BUILD_ID', '353a3cd')
    render(<AppVersionSetting model={inParts} />)

    expect(screen.getByText('Version').nextElementSibling).toHaveTextContent('353a3cd')
  })

  it('says unknown when the build carries no id', () => {
    vi.stubEnv('VITE_BUILD_ID', undefined)
    render(<AppVersionSetting model={inParts} />)

    expect(screen.getByText('Version').nextElementSibling).toHaveTextContent('unknown')
  })

  it('says the ledger is read in parts when the model has a paged list, and as one dataset when it has none', () => {
    const { rerender } = render(<AppVersionSetting model={inParts} />)
    expect(screen.getByText('Reads your data').nextElementSibling).toHaveTextContent('In parts (ledger mode)')

    rerender(<AppVersionSetting model={{}} />)
    expect(screen.getByText('Reads your data').nextElementSibling).toHaveTextContent('As one dataset (classic)')
  })
})
