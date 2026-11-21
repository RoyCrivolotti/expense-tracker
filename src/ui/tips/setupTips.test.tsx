import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { setMotionDisabledForTests } from '../hooks/motion'
import { emptySource, open, settingsHelp, sourceFor, storeWith, writesOf } from './tipsHarness'

describe('setup and the tips', () => {
  beforeEach(() => setMotionDisabledForTests(true))

  it('writes the empty list when a first run finishes', async () => {
    const source = emptySource(storeWith())
    open(source)
    fireEvent.click(await screen.findByText('Continue'))
    fireEvent.click(screen.getByText('Continue'))
    fireEvent.click(screen.getByText('Finish setup'))

    await waitFor(() => expect(writesOf(source)).toHaveBeenCalledWith(expect.objectContaining({ tipsSeen: [] })))
  })

  it('writes the empty list when a first run is skipped', async () => {
    const source = emptySource(storeWith())
    open(source)
    fireEvent.click(await screen.findByRole('button', { name: /skip/i }))

    await waitFor(() => expect(writesOf(source)).toHaveBeenCalledWith({ tipsSeen: [] }))
  })

  it('writes nothing when a re-run of setup is skipped, so an established person does not get every tip back', async () => {
    const source = sourceFor(storeWith())
    open(source)
    await screen.findByText('Budgets')

    await settingsHelp()
    fireEvent.click(await screen.findByRole('button', { name: 'Run setup again' }))
    fireEvent.click(await screen.findByRole('button', { name: /skip/i }))

    await waitFor(() => expect(screen.queryByRole('button', { name: /skip/i })).toBeNull())
    expect(writesOf(source)).not.toHaveBeenCalled()
  })

  it('shows the card to a person who skipped setup, with setting up still to do', async () => {
    open(emptySource(storeWith()))
    fireEvent.click(await screen.findByRole('button', { name: /skip/i }))

    const card = await screen.findByRole('region', { name: 'Getting started' })

    expect(within(card).getAllByRole('listitem')[0]).toHaveTextContent('To do: Set up your categories and accounts')
  })
})
