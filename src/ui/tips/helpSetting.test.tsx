import { fireEvent, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { setMotionDisabledForTests } from '../hooks/motion'
import { dashboardReady, card, emptySource, open, settingsHelp, sourceFor, storeWith } from './tipsHarness'

describe('Help in Settings, Setup', () => {
  beforeEach(() => setMotionDisabledForTests(true))

  it('comes back from Settings > Setup > Help > Show the tips again, on every device', async () => {
    const store = storeWith({ tipsSeen: ['getting-started'] })
    const source = sourceFor(store)
    open(source)
    await dashboardReady()
    expect(card()).toBeNull()

    await settingsHelp()
    fireEvent.click(await screen.findByRole('button', { name: 'Show the tips again' }))

    await waitFor(() => expect(store.settings.tipsSeen).toEqual([]))
    expect(await screen.findByText('Tips are back.')).toBeInTheDocument()
    fireEvent.click(screen.getAllByRole('button', { name: 'Dashboard' })[0]!)
    expect(await screen.findByRole('region', { name: 'Getting started' })).toBeInTheDocument()
  })

  it('says so when showing the tips again cannot be saved', async () => {
    const store = storeWith({ tipsSeen: ['getting-started'] })
    open(sourceFor(store))
    await dashboardReady()
    store.failWrites = true

    await settingsHelp()
    fireEvent.click(await screen.findByRole('button', { name: 'Show the tips again' }))

    expect(await screen.findByText(/probably wasn't saved/)).toBeInTheDocument()
    expect(store.settings.tipsSeen).toEqual(['getting-started'])
  })

  it('calls setup "Run setup" on an account with nothing in it yet, and "Run setup again" once it is set up', async () => {
    open(emptySource(storeWith()))
    fireEvent.click(await screen.findByRole('button', { name: /skip/i }))
    await settingsHelp()
    expect(await screen.findByRole('button', { name: 'Run setup' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Run setup again' })).toBeNull()
  })
})
