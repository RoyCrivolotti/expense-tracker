import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { ExpenseModel } from '../useExpenseData'
import { AccountView } from './AccountView'

vi.mock('./CaptureKeySetting', () => ({ CaptureKeySetting: () => <p>capture key card</p> }))
vi.mock('./CaptureCardsSetting', () => ({ CaptureCardsSetting: () => <p>linked cards</p> }))
vi.mock('./AppVersionSetting', () => ({ AppVersionSetting: () => <p>version</p> }))

const render_ = () => render(<AccountView model={{} as ExpenseModel} ownerAccess={undefined} accountEmail={undefined} />)

describe('the capture cards', () => {
  it('are on the Account view for every approved person', async () => {
    render_()

    expect(await screen.findByText('capture key card')).toBeInTheDocument()
    expect(await screen.findByText('linked cards')).toBeInTheDocument()
  })
})
