import { render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AssumptionsView } from './AssumptionsView'
import { defaultExpenseSettings } from '../../../engine'
import { makeWealthAccount } from '../../../testing/factories'
import { makeActions } from '../../../testing/makeActions'
import type { AssumptionsFocus } from './goalsView'

function renderAssumptions(focus?: AssumptionsFocus | null) {
  return render(
    <AssumptionsView
      accounts={[makeWealthAccount({ id: 1, name: 'Broker' })]}
      checkins={[]}
      settings={defaultExpenseSettings()}
      actions={makeActions()}
      onSettingsChange={vi.fn()}
      focus={focus ?? null}
    />,
  )
}

describe('AssumptionsView', () => {
  // jsdom has no scrollIntoView; the tests that stub it must not leave it behind.
  afterEach(() => {
    Reflect.deleteProperty(Element.prototype, 'scrollIntoView')
  })

  it('shows the milestone editor and the wealth accounts', () => {
    render(
      <AssumptionsView
        accounts={[makeWealthAccount({ id: 1, name: 'Broker' })]}
        checkins={[]}
        settings={defaultExpenseSettings()}
        actions={makeActions()}
        onSettingsChange={vi.fn()}
      />,
    )

    expect(screen.getByText('Milestones')).toBeInTheDocument()
    expect(screen.getByText('Wealth accounts')).toBeInTheDocument()
    expect(screen.getByText('Broker')).toBeInTheDocument()
  })

  it('carries the assumptions Progress is measured with, the assumed inflation among them', () => {
    render(
      <AssumptionsView
        accounts={[]}
        checkins={[]}
        settings={defaultExpenseSettings()}
        actions={makeActions()}
        onSettingsChange={vi.fn()}
      />,
    )

    expect(screen.getByText('Cash reserve')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Assumed inflation' })).toBeInTheDocument()
    expect(screen.getByLabelText('Assumed inflation')).toHaveValue('2,0')
  })

  it('says so in a read-only session instead of offering editors', () => {
    render(
      <AssumptionsView
        accounts={[]}
        checkins={[]}
        settings={defaultExpenseSettings()}
        actions={undefined}
        onSettingsChange={undefined}
      />,
    )

    expect(screen.getByText(/Read-only session/)).toBeInTheDocument()
    expect(screen.queryByText('Wealth accounts')).not.toBeInTheDocument()
  })

  it('brings the accounts card to the top when a link asks for the accounts', () => {
    const scrollIntoView = vi.fn()
    Element.prototype.scrollIntoView = scrollIntoView

    renderAssumptions('accounts')

    expect(scrollIntoView).toHaveBeenCalledTimes(1)
    expect(scrollIntoView).toHaveBeenCalledWith({ block: 'start' })
    expect(scrollIntoView.mock.contexts[0]).toContainElement(screen.getByText('Wealth accounts'))
  })

  it('leaves the accounts where they are when the view is opened any other way, or for the inflation', () => {
    const scrollIntoView = vi.fn()
    Element.prototype.scrollIntoView = scrollIntoView

    const { unmount } = renderAssumptions()
    unmount()
    renderAssumptions('inflation')

    // The inflation card scrolls itself, to its middle; the accounts card does not.
    expect(scrollIntoView).toHaveBeenCalledTimes(1)
    expect(scrollIntoView).toHaveBeenCalledWith({ block: 'center' })
  })
})
