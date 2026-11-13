import { render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ExpenseModel } from '../useExpenseData'
import { AccountView } from './AccountView'

vi.mock('./CaptureKeySetting', () => ({ CaptureKeySetting: () => <p>capture key card</p> }))
vi.mock('./CaptureCardsSetting', () => ({ CaptureCardsSetting: () => <p>linked cards</p> }))
vi.mock('./AppVersionSetting', () => ({ AppVersionSetting: () => <p>version</p> }))

const render_ = () => render(<AccountView model={{} as ExpenseModel} ownerAccess={undefined} accountEmail={undefined} />)

beforeEach(() => window.localStorage.clear())
afterEach(() => window.history.replaceState(null, '', '/'))

describe('the capture key card', () => {
  it('is not on the Account view until the flag is turned on', () => {
    render_()

    expect(screen.queryByText('capture key card')).not.toBeInTheDocument()
    expect(screen.queryByText('linked cards')).not.toBeInTheDocument()
  })

  it('shows once the flag is on', async () => {
    window.history.replaceState(null, '', '/?capture=on')
    render_()

    expect(await screen.findByText('capture key card')).toBeInTheDocument()
    expect(await screen.findByText('linked cards')).toBeInTheDocument()
  })
})
