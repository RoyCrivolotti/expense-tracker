import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { ExpenseModel } from '../useExpenseData'
import { CaptureView } from './CaptureView'

vi.mock('./CaptureSetupSetting', () => ({ CaptureSetupSetting: () => <p>setup steps</p> }))
vi.mock('./CaptureKeySetting', () => ({ CaptureKeySetting: () => <p>capture key</p> }))
vi.mock('./PushSetting', () => ({ PushSetting: () => <p>notifications</p> }))
vi.mock('./CaptureCardsSetting', () => ({ CaptureCardsSetting: () => <p>linked cards</p> }))
vi.mock('./CaptureMutedSetting', () => ({ CaptureMutedSetting: () => <p>muted pushes</p> }))
vi.mock('./CaptureDiagnosticsSetting', () => ({ CaptureDiagnosticsSetting: () => <p>diagnostics</p> }))

describe('the Capture view', () => {
  it('puts what is done once first, then what is chosen, then what is only looked at', async () => {
    const { container } = render(<CaptureView model={{} as ExpenseModel} />)
    await screen.findByText('diagnostics')

    expect([...container.querySelectorAll('p')].map((p) => p.textContent)).toEqual([
      'setup steps',
      'capture key',
      'notifications',
      'linked cards',
      'muted pushes',
      'diagnostics',
    ])
  })
})
