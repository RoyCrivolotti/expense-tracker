import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { act } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { GUIDE_SECTIONS } from '../../guide/gettingStarted'
import { GUIDE_TITLE } from '../../guide/guideTitle'
import { EXIT_MS, setMotionDisabledForTests } from '../hooks/motion'
import { HelpSetting } from '../settings/HelpSetting'
import { ToastProvider } from '../hooks/ToastProvider'
import { TipsProvider } from '../tips/TipsProvider'
import { card, dashboardReady, open, settingsHelp, sourceFor, storeWith } from '../tips/tipsHarness'
import { GuideHost } from './GuideHost'
import { useGuide } from './guideContext'

beforeEach(() => setMotionDisabledForTests(true))
afterEach(cleanup)

const sheet = () => screen.findByRole('dialog', { name: GUIDE_TITLE })

describe('the guide sheet', () => {
  it('opens from the Getting started card, shows every section of the one text, and closes', async () => {
    open(sourceFor(storeWith({ tipsSeen: [] })))
    await dashboardReady()
    expect(card()).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Read the guide' }))

    const dialog = await sheet()
    for (const section of GUIDE_SECTIONS) {
      expect(within(dialog).getByRole('heading', { name: section.title })).toBeInTheDocument()
      for (const block of section.blocks) {
        for (const text of block.kind === 'p' ? [block.text] : block.items) expect(within(dialog).getByText(text)).toBeInTheDocument()
      }
    }
    // Steps are numbered and the lists are bullets, as in the docs page.
    expect(within(dialog).getByText(/^Welcome\./).closest('ol')).not.toBeNull()
    expect(within(dialog).getByText(/^Expense: money you spend/).closest('ul')).not.toBeNull()
    // The card behind it stays: reading the guide does not put it away.
    expect(card()).toBeInTheDocument()

    fireEvent.click(within(dialog).getByRole('button', { name: /close/i }))
    await waitFor(() => expect(screen.queryByRole('dialog', { name: GUIDE_TITLE })).toBeNull())
  })

  it('opens from Settings, Setup, Help', async () => {
    open(sourceFor(storeWith({ tipsSeen: ['getting-started'] })))
    await dashboardReady()
    await settingsHelp()

    fireEvent.click(await screen.findByRole('button', { name: 'Open the guide' }))

    expect(await sheet()).toBeInTheDocument()
  })

  it('is not offered where there is no host to show it (a screen on its own)', () => {
    render(
      <ToastProvider>
        <TipsProvider saved={[]} hasTransactions save={() => Promise.resolve()}>
          <HelpSetting firstRun={false} onRunSetup={() => undefined} />
        </TipsProvider>
      </ToastProvider>,
    )
    expect(screen.queryByRole('button', { name: 'Open the guide' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Show the tips again' })).toBeInTheDocument()
  })

  it('stays closed until asked, and a second open after closing works', async () => {
    function Real() {
      const guide = useGuide()
      return <button onClick={() => guide?.open()}>open</button>
    }
    render(
      <GuideHost>
        <Real />
      </GuideHost>,
    )
    expect(screen.queryByRole('dialog')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'open' }))
    fireEvent.click(within(await sheet()).getByRole('button', { name: /close/i }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    fireEvent.click(screen.getByRole('button', { name: 'open' }))
    expect(await sheet()).toBeInTheDocument()
  })
})

describe('the guide sheet leaving', () => {
  function Opener() {
    const guide = useGuide()
    return <button onClick={() => guide?.open()}>open</button>
  }

  it('is held for the sheet exit time, inert while it goes, so it plays the same exit however it is closed', async () => {
    setMotionDisabledForTests(false)
    vi.useFakeTimers({ shouldAdvanceTime: true })
    try {
      render(
        <GuideHost>
          <Opener />
        </GuideHost>,
      )
      fireEvent.click(screen.getByRole('button', { name: 'open' }))
      const dialog = await sheet()
      fireEvent.click(within(dialog).getByRole('button', { name: /close/i }))
      expect(screen.getByRole('dialog', { name: GUIDE_TITLE, hidden: true })).toBeInTheDocument()
      act(() => void vi.advanceTimersByTime(EXIT_MS.sheet - 60))
      expect(screen.getByRole('dialog', { name: GUIDE_TITLE, hidden: true })).toBeInTheDocument()
      act(() => void vi.advanceTimersByTime(120))
      expect(screen.queryByRole('dialog', { name: GUIDE_TITLE, hidden: true })).toBeNull()
    } finally {
      vi.useRealTimers()
    }
  })
})
