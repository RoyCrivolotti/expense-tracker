import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { LeaveGuardProvider } from './LeaveGuardProvider'
import { useGuardLeave, useUnsavedWork, type UnsavedWork } from './leaveGuardContext'
import { leaveMessage } from './leaveMessage'

const EDITS: UnsavedWork = { name: 'Path A', detached: false, canSave: true, saving: false }

/** A section that holds `work` while mounted, and two ways out of it. */
function Section({ work, onGo }: { work: UnsavedWork | null; onGo: (where: string) => void }) {
  useUnsavedWork(work)
  const guardLeave = useGuardLeave()
  return (
    <>
      <button type="button" onClick={() => guardLeave(() => onGo('dashboard'))}>
        Dashboard
      </button>
      <button type="button" onClick={() => guardLeave(() => onGo('settings'))}>
        Settings
      </button>
    </>
  )
}

/** The shell: shows the section until it is left, and lets a test change what it holds. */
function Shell({
  initial,
  onGo,
  leavingRemovesSection = false,
}: {
  initial: UnsavedWork | null
  onGo: (where: string) => void
  /** As in the app, where going elsewhere is what unmounts the section. */
  leavingRemovesSection?: boolean
}) {
  const [work, setWork] = useState(initial)
  const [shown, setShown] = useState(true)
  return (
    <LeaveGuardProvider>
      <button type="button" onClick={() => setWork(null)}>
        Edits saved
      </button>
      <button type="button" onClick={() => setShown(false)}>
        Section gone
      </button>
      {shown ? (
        <Section
          work={work}
          onGo={(where) => {
            onGo(where)
            if (leavingRemovesSection) setShown(false)
          }}
        />
      ) : null}
    </LeaveGuardProvider>
  )
}

const sheet = () => screen.queryByRole('alertdialog')

describe('leave guard', () => {
  it('lets the section go at once when it holds no edits', async () => {
    const onGo = vi.fn()
    render(<Shell initial={null} onGo={onGo} />)

    await userEvent.setup().click(screen.getByRole('button', { name: 'Dashboard' }))

    expect(onGo).toHaveBeenCalledWith('dashboard')
    expect(sheet()).toBeNull()
  })

  it('lets every leave go when there is no shell around to ask', async () => {
    const onGo = vi.fn()
    render(<Section work={EDITS} onGo={onGo} />)

    await userEvent.setup().click(screen.getByRole('button', { name: 'Dashboard' }))

    expect(onGo).toHaveBeenCalledWith('dashboard')
  })

  it('asks first when the section holds edits, with Stay focused', async () => {
    const onGo = vi.fn()
    render(<Shell initial={EDITS} onGo={onGo} />)

    await userEvent.setup().click(screen.getByRole('button', { name: 'Dashboard' }))

    const dialog = screen.getByRole('alertdialog', { name: 'Leave without saving?' })
    expect(within(dialog).getByText(leaveMessage(EDITS))).toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: 'Stay' })).toHaveFocus()
    expect(onGo).not.toHaveBeenCalled()
  })

  it('stays on Stay, gives focus back to the control that was pressed, and asks again next time', async () => {
    const user = userEvent.setup()
    const onGo = vi.fn()
    render(<Shell initial={EDITS} onGo={onGo} />)
    const dashboard = screen.getByRole('button', { name: 'Dashboard' })

    await user.click(dashboard)
    await user.click(screen.getByRole('button', { name: 'Stay' }))

    expect(sheet()).toBeNull()
    expect(onGo).not.toHaveBeenCalled()
    expect(dashboard).toHaveFocus()

    await user.click(dashboard)
    expect(sheet()).not.toBeNull()
  })

  it('stays on Escape', async () => {
    const user = userEvent.setup()
    const onGo = vi.fn()
    render(<Shell initial={EDITS} onGo={onGo} />)

    await user.click(screen.getByRole('button', { name: 'Settings' }))
    await user.keyboard('{Escape}')

    expect(sheet()).toBeNull()
    expect(onGo).not.toHaveBeenCalled()
  })

  it('stays on a tap outside the sheet', async () => {
    const user = userEvent.setup()
    const onGo = vi.fn()
    render(<Shell initial={EDITS} onGo={onGo} />)

    await user.click(screen.getByRole('button', { name: 'Dashboard' }))
    // The scrim is the sheet's parent; a press on the sheet itself does not count.
    await user.click(screen.getByRole('alertdialog').parentElement!)

    expect(sheet()).toBeNull()
    expect(onGo).not.toHaveBeenCalled()
  })

  it('goes where the user was headed on Leave, once', async () => {
    const user = userEvent.setup()
    const onGo = vi.fn()
    render(<Shell initial={EDITS} onGo={onGo} />)

    await user.click(screen.getByRole('button', { name: 'Settings' }))
    await user.click(screen.getByRole('button', { name: 'Leave' }))

    expect(onGo).toHaveBeenCalledTimes(1)
    expect(onGo).toHaveBeenCalledWith('settings')
    expect(sheet()).toBeNull()
  })

  it('goes once when going is what takes the section away', async () => {
    const user = userEvent.setup()
    const onGo = vi.fn()
    render(<Shell initial={EDITS} onGo={onGo} leavingRemovesSection />)

    await user.click(screen.getByRole('button', { name: 'Dashboard' }))
    await user.click(screen.getByRole('button', { name: 'Leave' }))

    expect(onGo).toHaveBeenCalledTimes(1)
  })

  it('goes to the last place pressed when two are pressed before the answer', async () => {
    const onGo = vi.fn()
    render(<Shell initial={EDITS} onGo={onGo} />)

    // Both land before the sheet has covered the page, as two quick clicks do.
    act(() => {
      screen.getByRole('button', { name: 'Dashboard' }).click()
      screen.getByRole('button', { name: 'Settings' }).click()
    })
    expect(screen.getAllByRole('alertdialog')).toHaveLength(1)
    await userEvent.setup().click(screen.getByRole('button', { name: 'Leave' }))

    expect(onGo).toHaveBeenCalledTimes(1)
    expect(onGo).toHaveBeenCalledWith('settings')
  })

  it('does not ask while a save is on its way', async () => {
    const onGo = vi.fn()
    render(<Shell initial={{ ...EDITS, saving: true }} onGo={onGo} />)

    await userEvent.setup().click(screen.getByRole('button', { name: 'Dashboard' }))

    expect(onGo).toHaveBeenCalledWith('dashboard')
    expect(sheet()).toBeNull()
  })

  it('goes on its own, without the warning, when the edits are saved while it is up', async () => {
    const user = userEvent.setup()
    const onGo = vi.fn()
    render(<Shell initial={EDITS} onGo={onGo} />)

    await user.click(screen.getByRole('button', { name: 'Dashboard' }))
    // Not reachable by a click behind the sheet: a refresh bringing the same values does this.
    act(() => screen.getByRole('button', { name: 'Edits saved', hidden: true }).click())

    expect(onGo).toHaveBeenCalledTimes(1)
    expect(onGo).toHaveBeenCalledWith('dashboard')
    expect(sheet()).toBeNull()
  })

  it('goes on its own when the section itself goes away while the question is up', async () => {
    const user = userEvent.setup()
    const onGo = vi.fn()
    render(<Shell initial={EDITS} onGo={onGo} />)

    await user.click(screen.getByRole('button', { name: 'Dashboard' }))
    act(() => screen.getByRole('button', { name: 'Section gone', hidden: true }).click())

    expect(onGo).toHaveBeenCalledTimes(1)
    expect(sheet()).toBeNull()
  })

  it('does not go later when the edits are saved after Stay was pressed', async () => {
    const user = userEvent.setup()
    const onGo = vi.fn()
    render(<Shell initial={EDITS} onGo={onGo} />)

    await user.click(screen.getByRole('button', { name: 'Dashboard' }))
    await user.click(screen.getByRole('button', { name: 'Stay' }))
    await user.click(screen.getByRole('button', { name: 'Edits saved' }))

    expect(onGo).not.toHaveBeenCalled()
  })

  describe('the browser prompt', () => {
    /** Fires what a reload or a closing tab fires, and says whether the page asked to be kept. */
    const tryToUnload = () => {
      const event = new Event('beforeunload', { cancelable: true })
      window.dispatchEvent(event)
      return event.defaultPrevented
    }

    it('is asked for while edits are held, and not otherwise', async () => {
      const user = userEvent.setup()
      render(<Shell initial={EDITS} onGo={vi.fn()} />)
      expect(tryToUnload()).toBe(true)

      await user.click(screen.getByRole('button', { name: 'Edits saved' }))
      expect(tryToUnload()).toBe(false)
    })

    it('is not asked for when nothing is held', () => {
      render(<Shell initial={null} onGo={vi.fn()} />)
      expect(tryToUnload()).toBe(false)
    })

    it('is asked for while a save is on its way, since a reload could cut it off', () => {
      render(<Shell initial={{ ...EDITS, saving: true }} onGo={vi.fn()} />)
      expect(tryToUnload()).toBe(true)
    })

    it('is let go when the section goes away', async () => {
      const user = userEvent.setup()
      const { unmount } = render(<Shell initial={EDITS} onGo={vi.fn()} />)
      await user.click(screen.getByRole('button', { name: 'Section gone' }))
      expect(tryToUnload()).toBe(false)
      unmount()
      expect(tryToUnload()).toBe(false)
    })
  })
})
