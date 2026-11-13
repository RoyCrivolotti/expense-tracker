import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as keysApi from '../../data/captureKeysApi'
import * as statusApi from '../../data/captureStatusApi'
import { CaptureSetupSetting } from './CaptureSetupSetting'

vi.mock('../../data/captureKeysApi', async (original) => ({
  ...(await original<typeof keysApi>()),
  fetchCaptureKeys: vi.fn(),
}))
vi.mock('../../data/captureStatusApi')

const ADDRESS = 'https://capture.example.workers.dev/capture'
const phone = { keyId: '0123456789abcdef', label: 'My iPhone', createdAt: '2026-11-03T09:00:00.000Z', lastUsedAt: null }
const none: statusApi.SourceStatus = { source: 'iberia', lastCaptureAt: null, received: 0, unrecognised: 0 }

const status = (iberia = none, endpoint: string | null = ADDRESS, shortcutUrl: string | null = null) =>
  vi
    .mocked(statusApi.fetchCaptureStatus)
    .mockResolvedValue({ sources: [iberia, { ...none, source: 'santander' }], endpoint, shortcutUrl })

beforeEach(() => {
  localStorage.clear()
  vi.mocked(keysApi.fetchCaptureKeys).mockResolvedValue([])
  status()
})
afterEach(() => vi.resetAllMocks())

describe('the first-payment check', () => {
  it('waits, and mentions an unused key', async () => {
    vi.mocked(keysApi.fetchCaptureKeys).mockResolvedValue([phone])
    render(<CaptureSetupSetting />)

    expect(await screen.findByText('Waiting for your first payment')).toBeInTheDocument()
    expect(await screen.findByText(/Your key has not been used yet/)).toBeInTheDocument()
    expect(screen.getByText(/2\. Make a key \(done\)/)).toBeInTheDocument()
  })

  it('does not say the key is unused when there is none', async () => {
    render(<CaptureSetupSetting />)

    await screen.findByText('Waiting for your first payment')
    expect(screen.queryByText(/key has not been used/)).not.toBeInTheDocument()
    expect(screen.queryByText(/\(done\)/)).not.toBeInTheDocument()
  })

  it('says pushes are arriving but none was read as a payment', async () => {
    status({ ...none, received: 4, unrecognised: 4 })
    render(<CaptureSetupSetting />)

    expect(await screen.findByText('Arriving, not read as a payment')).toBeInTheDocument()
    expect(screen.getByText(/\(4 in the last 7 days\) but none was read as a payment/)).toBeInTheDocument()
  })

  it('shows the last capture when one was read', async () => {
    status({ ...none, lastCaptureAt: new Date().toISOString(), received: 1 })
    render(<CaptureSetupSetting />)

    expect(await screen.findByText('Last payment captured')).toBeInTheDocument()
    expect(screen.getByText(/Iberia: last payment captured today at/)).toBeInTheDocument()
  })

  it('does not read green for an old capture, and says nothing has been captured lately', async () => {
    status({ ...none, lastCaptureAt: new Date(Date.now() - 10 * 86_400_000).toISOString(), received: 0 })
    render(<CaptureSetupSetting />)

    expect(await screen.findByText('Nothing captured lately')).toBeInTheDocument()
    expect(screen.queryByText('Last payment captured')).not.toBeInTheDocument()
  })

  it('does not read green when every push of the week went unread, though one was read before', async () => {
    status({ ...none, lastCaptureAt: new Date(Date.now() - 86_400_000).toISOString(), received: 6, unrecognised: 6 })
    render(<CaptureSetupSetting />)

    expect(await screen.findByText('Arriving, not read as a payment')).toBeInTheDocument()
    expect(screen.getByText(/Iberia: last payment captured yesterday at/)).toBeInTheDocument()
  })

  it('reads again on Check again, on a key change and when the screen comes back into view', async () => {
    render(<CaptureSetupSetting />)
    await screen.findByText('Waiting for your first payment')
    const calls = () => vi.mocked(statusApi.fetchCaptureStatus).mock.calls.length

    fireEvent.click(screen.getByRole('button', { name: 'Check again' }))
    await waitFor(() => expect(calls()).toBe(2))
    keysApi.announceCaptureKeysChanged()
    await waitFor(() => expect(calls()).toBe(3))
    document.dispatchEvent(new Event('visibilitychange'))
    await waitFor(() => expect(calls()).toBe(4))
  })

  it('says only Checking while the read is out, and claims nothing about the phone', async () => {
    vi.mocked(statusApi.fetchCaptureStatus).mockReturnValue(new Promise(() => undefined))
    render(<CaptureSetupSetting />)

    expect(await screen.findByText('Checking')).toBeInTheDocument()
    expect(screen.queryByText(/Nothing has reached the app/)).not.toBeInTheDocument()
    expect(screen.queryByText('Waiting for your first payment')).not.toBeInTheDocument()
  })

  it('adds how many were unread beside a recent payment, with no change of state', async () => {
    status({ ...none, lastCaptureAt: new Date().toISOString(), received: 5, unrecognised: 2 })
    render(<CaptureSetupSetting />)

    expect(await screen.findByText('Last payment captured')).toBeInTheDocument()
    expect(screen.getByText(/2 of 5 unread in the last 7 days\./)).toBeInTheDocument()
  })

  it('says nothing of unread pushes when none was unread', async () => {
    status({ ...none, lastCaptureAt: new Date().toISOString(), received: 5, unrecognised: 0 })
    render(<CaptureSetupSetting />)

    await screen.findByText('Last payment captured')
    expect(screen.queryByText(/unread in the last 7 days/)).not.toBeInTheDocument()
  })

  it('shows why when it cannot read', async () => {
    vi.mocked(statusApi.fetchCaptureStatus).mockRejectedValue(new Error('Request failed (500)'))
    render(<CaptureSetupSetting />)

    expect(await screen.findByRole('alert')).toHaveTextContent('Request failed (500)')
    // The error line alone: no claim that nothing arrived, and no Checking left behind.
    expect(screen.queryByText(/Nothing has reached the app/)).not.toBeInTheDocument()
    expect(screen.queryByText('Waiting for your first payment')).not.toBeInTheDocument()
    expect(screen.queryByText('Checking')).not.toBeInTheDocument()
  })
})

describe('the steps', () => {
  it('says plainly what it cannot know about the phone, and what was and was not tried', async () => {
    render(<CaptureSetupSetting />)
    await screen.findByText('Waiting for your first payment')

    expect(screen.getByText(/This screen cannot tell your version/)).toBeInTheDocument()
    expect(screen.getByText(/built by hand from these steps worked on one phone/)).toBeInTheDocument()
    expect(screen.getByText(/has not been tried on a second phone/)).toBeInTheDocument()
    expect(screen.getByText(/We have not tried an older iPhone or Android/)).toBeInTheDocument()
  })

  it("shows the server's address with a Copy button", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } })
    render(<CaptureSetupSetting />)

    expect(await screen.findByText(ADDRESS)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Copy the address' }))
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(ADDRESS))
    expect(await screen.findByText('Copied', { selector: 'button' })).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('Copied')
  })

  it('says so when the clipboard refuses', async () => {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: vi.fn().mockRejectedValue(new Error('no')) },
    })
    render(<CaptureSetupSetting />)
    fireEvent.click(await screen.findByRole('button', { name: 'Copy the address' }))

    expect(await screen.findByText('Copy failed, select it')).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('Copy failed')
  })

  it('asks for the address when the server has none, keeps a pasted https one, and refuses another', async () => {
    status(none, null)
    render(<CaptureSetupSetting />)
    const input = await screen.findByPlaceholderText('https://capture.example.workers.dev')

    fireEvent.change(input, { target: { value: 'http://capture.example.workers.dev' } })
    expect(screen.getByText('That is not an https address.')).toBeInTheDocument()
    fireEvent.change(input, { target: { value: 'https://capture.example.workers.dev' } })
    expect(await screen.findByText(ADDRESS)).toBeInTheDocument()
    expect(localStorage.getItem('expenses-capture-setup')).toContain('capture.example.workers.dev')
  })

  it('keeps what the person ticked in this browser', async () => {
    const { unmount } = render(<CaptureSetupSetting />)
    fireEvent.click(await screen.findByRole('checkbox', { name: /1\. Check your iPhone/ }))
    unmount()
    render(<CaptureSetupSetting />)

    expect(await screen.findByRole('checkbox', { name: /1\. Check your iPhone/ })).toBeChecked()
    fireEvent.click(screen.getByRole('checkbox', { name: /1\. Check your iPhone/ }))
    expect(screen.getByRole('checkbox', { name: /1\. Check your iPhone/ })).not.toBeChecked()
  })
})

describe('with a shortcut link', () => {
  // Invented: never a real link.
  const LINK = 'https://www.icloud.com/shortcuts/example0000000000000000000000000000'

  it('replaces the manual build with an Add the shortcut link that opens in its own tab, and says what was tried', async () => {
    status(none, null, LINK)
    render(<CaptureSetupSetting />)

    const link = await screen.findByRole('link', { name: 'Add the shortcut' })
    expect(link).toHaveAttribute('href', LINK)
    expect(link).toHaveAttribute('target', '_blank')
    expect(link).toHaveAttribute('rel', 'noopener noreferrer')
    expect(screen.getByText(/Shortcuts opens and asks for your capture key/)).toBeInTheDocument()
    expect(screen.getByText(/installed from a shared copy on one phone and worked/)).toBeInTheDocument()
    expect(
      screen.getByText(/not been tried from the installed Home Screen app or on a second phone/),
    ).toBeInTheDocument()
    expect(screen.queryByText(/Build the shortcut/)).not.toBeInTheDocument()
    expect(screen.queryByText(/Point it at the app/)).not.toBeInTheDocument()
  })

  it('numbers the steps in order, with the key first and copied, and keeps the later steps and the check', async () => {
    status(none, null, LINK)
    render(<CaptureSetupSetting />)
    await screen.findByRole('link', { name: 'Add the shortcut' })

    const titles = screen.getAllByText(/^\d\. /).map((e) => e.textContent)
    expect(titles).toEqual([
      '1. Check your iPhone',
      '2. Make a key and copy it',
      '3. Add the shortcut',
      '4. Run it automatically',
      '5. If iOS keeps asking',
    ])
    expect(screen.getByText(/Tap Copy as soon as it appears/)).toBeInTheDocument()
    expect(screen.getByText(/arrive with its automation switched off/)).toBeInTheDocument()
    expect(screen.getByText(/Allow Running When Locked/)).toBeInTheDocument()
    expect(screen.getByText('Waiting for your first payment')).toBeInTheDocument()
  })

  it('shows neither the link nor the manual steps until the status has been read', async () => {
    vi.mocked(statusApi.fetchCaptureStatus).mockReturnValue(new Promise(() => undefined))
    render(<CaptureSetupSetting />)

    await screen.findByText('Checking')
    expect(screen.queryByRole('link', { name: 'Add the shortcut' })).not.toBeInTheDocument()
    expect(screen.queryByText(/Build the shortcut/)).not.toBeInTheDocument()
  })

  it('falls back to the manual steps when the status cannot be read', async () => {
    vi.mocked(statusApi.fetchCaptureStatus).mockRejectedValue(new Error('Request failed (500)'))
    render(<CaptureSetupSetting />)

    expect(await screen.findByText('3. Build the shortcut')).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Add the shortcut' })).not.toBeInTheDocument()
  })
})

describe('without a shortcut link', () => {
  it('shows the manual steps, in order, and no Add the shortcut link', async () => {
    render(<CaptureSetupSetting />)
    await screen.findByText('3. Build the shortcut')

    expect(screen.queryByRole('link', { name: 'Add the shortcut' })).not.toBeInTheDocument()
    expect(screen.getAllByText(/^\d\. /).map((e) => e.textContent)).toEqual([
      '1. Check your iPhone',
      '2. Make a key',
      '3. Build the shortcut',
      '4. Point it at the app',
      '5. Run it automatically',
      '6. If iOS keeps asking',
    ])
  })
})
