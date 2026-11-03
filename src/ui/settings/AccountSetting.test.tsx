/**
 * Signing out takes the copies of the data this device keeps for when the network is out, so a launch after it does not
 * open on them for the person who left. The sign-out itself never waits long on that.
 */
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { type FakeIndexedDb, installFakeIndexedDb } from '../../testing/fakeIndexedDb'
import { AccountSetting } from './AccountSetting'

let idb: FakeIndexedDb
let assign: ReturnType<typeof vi.fn>
/** What the device still held at the moment the page was sent away. */
let keptWhenLeaving: unknown[]

beforeEach(() => {
  idb = installFakeIndexedDb()
  idb.stores.set('snapshots', new Map<IDBValidKey, unknown>([['latest', { key: 'latest' }], ['ledger:a@example.com', { key: 'ledger:a@example.com' }]]))
  keptWhenLeaving = []
  assign = vi.fn(() => void (keptWhenLeaving = [...(idb.stores.get('snapshots')?.keys() ?? [])]))
  vi.stubGlobal('location', { assign })
})

afterEach(() => {
  vi.doUnmock('../../data/savedCopy')
  vi.useRealTimers()
  idb.uninstall()
  vi.unstubAllGlobals()
})

const signOut = () => fireEvent.click(screen.getByRole('link', { name: 'Sign out' }))

describe('Sign out', () => {
  it('keeps the link, so it still works where nothing runs', () => {
    render(<AccountSetting email="a@example.com" />)

    expect(screen.getByRole('link', { name: 'Sign out' })).toHaveAttribute('href', expect.stringContaining('/cdn-cgi/access/logout'))
  })

  it('drops every saved copy, then goes to the sign-out address', async () => {
    render(<AccountSetting email="a@example.com" />)

    signOut()

    await waitFor(() => expect(assign).toHaveBeenCalledWith(expect.stringContaining('/cdn-cgi/access/logout')))
    expect(keptWhenLeaving).toEqual([])
  })

  it('goes to the sign-out address after a second when the store never answers', async () => {
    idb.hangOpen()
    render(<AccountSetting email="a@example.com" />)
    vi.useFakeTimers()

    signOut()
    await act(() => vi.advanceTimersByTimeAsync(999))
    expect(assign).not.toHaveBeenCalled()
    await act(() => vi.advanceTimersByTimeAsync(1))

    expect(assign).toHaveBeenCalledOnce()
  })

  it('goes to the sign-out address when the lookup chunk cannot be loaded', async () => {
    // A build deployed since the app was last open, with no network to fetch the chunk the old page names.
    vi.doMock('../../data/savedCopy', () => {
      throw new Error('Failed to fetch dynamically imported module')
    })
    render(<AccountSetting email="a@example.com" />)

    signOut()

    await waitFor(() => expect(assign).toHaveBeenCalledOnce())
  })
})
