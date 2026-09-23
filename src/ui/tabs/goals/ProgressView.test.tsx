import { fireEvent, render, screen } from '@testing-library/react'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { ProgressView } from './ProgressView'
import { makeWealthAccount } from '../../../testing/factories'
import { makeActions } from '../../../testing/makeActions'

beforeAll(() => {
  // The check-in chart's tooltip reads a media query; jsdom has no matchMedia.
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

describe('ProgressView', () => {
  it('sends the user to Setup when there is no account to log against', () => {
    const onOpenSetup = vi.fn()
    render(
      <ProgressView
        accounts={[makeWealthAccount({ id: 1, archived: true })]}
        checkins={[]}
        milestones={[]}
        reached={new Map()}
        plan={null}
        actions={makeActions()}
        canWrite
        onOpenSetup={onOpenSetup}
      />,
    )

    expect(screen.queryByRole('button', { name: '+ Log check-in' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Set up accounts' }))
    expect(onOpenSetup).toHaveBeenCalled()
  })

  it('offers to log a check-in once an account exists, and keeps setup elsewhere', () => {
    render(
      <ProgressView
        accounts={[makeWealthAccount({ id: 1 })]}
        checkins={[]}
        milestones={[]}
        reached={new Map()}
        plan={null}
        actions={makeActions()}
        canWrite
      />,
    )

    expect(screen.getByRole('button', { name: '+ Log check-in' })).toBeInTheDocument()
    expect(screen.queryByText('Wealth accounts')).not.toBeInTheDocument()
    expect(screen.queryByText('Milestones')).not.toBeInTheDocument()
  })

  it('offers nothing to log in a read-only session', () => {
    render(
      <ProgressView
        accounts={[]}
        checkins={[]}
        milestones={[]}
        reached={new Map()}
        plan={null}
        actions={undefined}
        canWrite={false}
      />,
    )

    expect(screen.queryByRole('button', { name: 'Set up accounts' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '+ Log check-in' })).not.toBeInTheDocument()
  })
})
