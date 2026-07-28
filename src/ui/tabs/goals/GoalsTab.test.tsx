import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { GoalsTab } from './GoalsTab'
import { buildExpenseModel } from '../../buildExpenseModel'
import { makeDataset } from '../../../testing/factories'

beforeAll(() => {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  })
})

function makeModel() {
  return buildExpenseModel(makeDataset())
}

describe('GoalsTab', () => {
  it('renders with Plan view by default', () => {
    render(<GoalsTab model={makeModel()} />)
    expect(screen.getByRole('radio', { name: 'Plan' })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: 'Progress' })).toBeInTheDocument()
  })

  it('switches to Progress view when Progress tab is selected', async () => {
    const user = userEvent.setup()
    render(<GoalsTab model={makeModel()} />)

    await user.click(screen.getByRole('radio', { name: 'Progress' }))

    expect(screen.getByText('Progress snapshot')).toBeInTheDocument()
  })

  it('shows Plan view content when Plan tab is active', () => {
    render(<GoalsTab model={makeModel()} />)
    expect(screen.getByText(/Invested portfolio projection/i)).toBeInTheDocument()
  })
})
