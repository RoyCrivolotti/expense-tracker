import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { HubMenuRoot, HubMenuTrigger } from 'folio-shell'
import { describe, expect, it } from 'vitest'
import { isBodyScrollLocked, useBodyScrollLock } from './useBodyScrollLock'

function Sheet() {
  useBodyScrollLock(true)
  return null
}

function tree(withSheet: boolean) {
  return (
    <HubMenuRoot anchor="inline" navItems={[]}>
      <HubMenuTrigger label="Navigate" />
      {withSheet ? <Sheet /> : null}
    </HubMenuRoot>
  )
}

describe('useBodyScrollLock', () => {
  it('leaves the page scrollable when the hub menu closes after a sheet has already gone', async () => {
    // Close a sheet, tap the hamburger while it is still animating out, close the menu: the shape of
    // the bug that left the bottom bar raised until the installed app was restarted.
    const user = userEvent.setup()
    const { rerender } = render(tree(true))

    await user.click(screen.getByRole('button', { name: 'Navigate' }))
    rerender(tree(false))
    await user.keyboard('{Escape}')

    expect(document.body.style.position).toBe('')
    expect(document.body.style.overflow).toBe('')
    expect(isBodyScrollLocked()).toBe(false)
  })

  it('counts an open hub menu as a lock, so pull-to-refresh stays out of its way', async () => {
    const user = userEvent.setup()
    render(tree(false))
    expect(isBodyScrollLocked()).toBe(false)

    await user.click(screen.getByRole('button', { name: 'Navigate' }))
    expect(isBodyScrollLocked()).toBe(true)

    await user.keyboard('{Escape}')
    expect(isBodyScrollLocked()).toBe(false)
  })
})
