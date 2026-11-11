import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '../../data/apiClient'
import * as api from '../../data/captureKeysApi'
import { CaptureKeySetting } from './CaptureKeySetting'

vi.mock('../../data/captureKeysApi')

// An invented key: the repo is public.
const KEY = `xpk_0123456789abcdef_${'ab'.repeat(32)}`
const phone = { keyId: '0123456789abcdef', label: 'My iPhone', createdAt: '2026-11-03T09:00:00.000Z', lastUsedAt: null }
const used = { ...phone, keyId: 'fedcba9876543210', label: 'Old phone', lastUsedAt: '2026-11-10T18:30:00.000Z' }

const listed = (...keys: api.CaptureKeyInfo[]) => vi.mocked(api.fetchCaptureKeys).mockResolvedValue(keys)

beforeEach(() => {
  vi.mocked(api.revokeCaptureKey).mockResolvedValue(undefined)
})
afterEach(() => vi.resetAllMocks())

describe('the key list', () => {
  it('says when there are none', async () => {
    listed()
    render(<CaptureKeySetting />)

    expect(await screen.findByText('No keys yet.')).toBeInTheDocument()
  })

  it('shows each key by name with when it was made and last used, never the key', async () => {
    listed(phone, used)
    render(<CaptureKeySetting />)

    expect(await screen.findByText('My iPhone')).toBeInTheDocument()
    expect(screen.getByText('Made 3 Nov · never used')).toBeInTheDocument()
    expect(screen.getByText('Made 3 Nov · last used 10 Nov')).toBeInTheDocument()
    expect(document.body.textContent).not.toContain('xpk_')
  })

  it('shows the reason when the list cannot be read', async () => {
    vi.mocked(api.fetchCaptureKeys).mockRejectedValue(new ApiError('Request failed (500)', 500))
    render(<CaptureKeySetting />)

    expect(await screen.findByRole('alert')).toHaveTextContent('Request failed (500)')
  })

  it('shows a plain message when the failure is not an Error', async () => {
    vi.mocked(api.fetchCaptureKeys).mockRejectedValue('boom')
    render(<CaptureKeySetting />)

    expect(await screen.findByRole('alert')).toHaveTextContent('Something went wrong')
  })
})

describe('making a key', () => {
  it('sends the name, shows the whole key once, and lists the new key', async () => {
    listed()
    vi.mocked(api.createCaptureKey).mockResolvedValue({ ...phone, key: KEY })
    render(<CaptureKeySetting />)
    await screen.findByText('No keys yet.')
    listed(phone)

    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'My iPhone' } })
    fireEvent.click(screen.getByRole('button', { name: 'Make a key' }))

    expect(await screen.findByText(KEY)).toBeInTheDocument()
    expect(api.createCaptureKey).toHaveBeenCalledWith('My iPhone')
    expect(await screen.findByText('Made 3 Nov · never used')).toBeInTheDocument()
    await waitFor(() => expect(screen.getByLabelText('Name')).toHaveValue(''))
  })

  it('forgets the key when it is dismissed', async () => {
    listed()
    vi.mocked(api.createCaptureKey).mockResolvedValue({ ...phone, key: KEY })
    render(<CaptureKeySetting />)
    fireEvent.click(await screen.findByRole('button', { name: 'Make a key' }))
    await screen.findByText(KEY)

    fireEvent.click(screen.getByRole('button', { name: 'Done' }))

    expect(screen.queryByText(KEY)).not.toBeInTheDocument()
  })

  it('copies the key', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    vi.stubGlobal('navigator', { clipboard: { writeText } })
    listed()
    vi.mocked(api.createCaptureKey).mockResolvedValue({ ...phone, key: KEY })
    render(<CaptureKeySetting />)
    fireEvent.click(await screen.findByRole('button', { name: 'Make a key' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Copy' }))

    expect(await screen.findByRole('button', { name: 'Copied' })).toBeInTheDocument()
    expect(writeText).toHaveBeenCalledWith(KEY)
    vi.unstubAllGlobals()
  })

  it('says so when the browser refuses to copy', async () => {
    vi.stubGlobal('navigator', { clipboard: { writeText: vi.fn().mockRejectedValue(new Error('no')) } })
    listed()
    vi.mocked(api.createCaptureKey).mockResolvedValue({ ...phone, key: KEY })
    render(<CaptureKeySetting />)
    fireEvent.click(await screen.findByRole('button', { name: 'Make a key' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Copy' }))

    expect(await screen.findByRole('button', { name: 'Copy failed, select it' })).toBeInTheDocument()
    vi.unstubAllGlobals()
  })

  it('shows the limit message from the server and keeps no key on screen', async () => {
    listed(phone)
    vi.mocked(api.createCaptureKey).mockRejectedValue(new ApiError('You already have the most keys allowed. Revoke one first.', 409))
    render(<CaptureKeySetting />)
    fireEvent.click(await screen.findByRole('button', { name: 'Make a key' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Revoke one first')
    expect(screen.queryByText(KEY)).not.toBeInTheDocument()
  })
})

describe('the name field', () => {
  it.each([409, 500])('keeps what was typed when making the key fails with %i', async (status) => {
    listed(phone)
    vi.mocked(api.createCaptureKey).mockRejectedValue(new ApiError('nope', status))
    render(<CaptureKeySetting />)
    await screen.findByText('My iPhone')

    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Work phone' } })
    fireEvent.click(screen.getByRole('button', { name: 'Make a key' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('nope')
    expect(screen.getByLabelText('Name')).toHaveValue('Work phone')
  })
})

describe('revoking a key', () => {
  it('asks first, then revokes and refreshes the list', async () => {
    listed(phone)
    render(<CaptureKeySetting />)
    fireEvent.click(await screen.findByRole('button', { name: 'Revoke My iPhone' }))
    expect(api.revokeCaptureKey).not.toHaveBeenCalled()
    listed()

    fireEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Revoke' }))

    await waitFor(() => expect(api.revokeCaptureKey).toHaveBeenCalledWith(phone.keyId))
    expect(await screen.findByText('No keys yet.')).toBeInTheDocument()
  })

  it('does nothing when the question is cancelled', async () => {
    listed(phone)
    render(<CaptureKeySetting />)
    fireEvent.click(await screen.findByRole('button', { name: 'Revoke My iPhone' }))

    fireEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Cancel' }))

    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument())
    expect(api.revokeCaptureKey).not.toHaveBeenCalled()
  })

  it('shows why when the revoke fails', async () => {
    listed(phone)
    vi.mocked(api.revokeCaptureKey).mockRejectedValue(new ApiError('Key not found', 404))
    render(<CaptureKeySetting />)
    fireEvent.click(await screen.findByRole('button', { name: 'Revoke My iPhone' }))

    fireEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Revoke' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Key not found')
  })
})
