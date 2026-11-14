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

const LINK = 'https://www.icloud.com/shortcuts/abc123'
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
    expect(screen.getByText(/1\. Make a key and copy it \(a key already exists\)/)).toBeInTheDocument()
  })

  it('does not say the key is unused when there is none', async () => {
    render(<CaptureSetupSetting />)

    await screen.findByText('Waiting for your first payment')
    expect(screen.queryByText(/key has not been used/)).not.toBeInTheDocument()
    expect(screen.queryByText(/\(a key already exists\)/)).not.toBeInTheDocument()
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

    expect(screen.getByText(/Check your version in Settings, General, About/)).toBeInTheDocument()
    expect(screen.getByText(/built by hand from steps like these worked on one phone/)).toBeInTheDocument()
    expect(screen.getByText(/has not been tried on a second phone/)).toBeInTheDocument()
    expect(screen.getByText(/not seen the iOS 27 screens beyond the trigger/)).toBeInTheDocument()
    expect(screen.getByText(/older iPhones and Android are not tried/)).toBeInTheDocument()
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
    fireEvent.click(await screen.findByRole('checkbox', { name: /1\. Make a key and copy it/ }))
    unmount()
    render(<CaptureSetupSetting />)

    expect(await screen.findByRole('checkbox', { name: /1\. Make a key and copy it/ })).toBeChecked()
    fireEvent.click(screen.getByRole('checkbox', { name: /1\. Make a key and copy it/ }))
    expect(screen.getByRole('checkbox', { name: /1\. Make a key and copy it/ })).not.toBeChecked()
  })
})

/** A step's sentence, whose bold words split it into several elements. */
const para = (pattern: RegExp) => screen.getByText((_, el) => el?.tagName === 'P' && pattern.test(el.textContent ?? ''))

describe('with the shortcut link available', () => {
  const titles = () => screen.getAllByText(/^\d+\. /).map((e) => e.textContent)

  it('shows an Add the shortcut link to the iCloud share link, in a new window, and says what was tried', async () => {
    status(none, null, LINK)
    render(<CaptureSetupSetting />)

    const link = await screen.findByRole('link', { name: 'Add the shortcut' })
    expect(link).toHaveAttribute('href', LINK)
    expect(link).toHaveAttribute('target', '_blank')
    expect(link).toHaveAttribute('rel', 'noopener noreferrer')
    expect(link).not.toHaveAttribute('download')
    expect(link.className).toContain('linkButton')
    expect(screen.getByText(/installed from a shared copy on one phone and worked/)).toBeInTheDocument()
    expect(screen.getByText(/not been tried on a second phone/)).toBeInTheDocument()
    expect(screen.getByText(/tell us what differs/)).toBeInTheDocument()
    expect(screen.queryByText(/Get Contents of URL/)).not.toBeInTheDocument()
    expect(document.querySelector('a[href*="/api/capture-shortcut"]')).toBeNull()
  })

  it('gives the key, the link, the three edits one at a time, the automation check and a purchase, in order', async () => {
    status(none, null, LINK)
    render(<CaptureSetupSetting />)
    await screen.findByRole('link', { name: 'Add the shortcut' })

    expect(titles()).toEqual([
      '1. Make a key and copy it',
      '2. Add the shortcut',
      '3. Choose your bank\u2019s app',
      '4. Paste your key',
      '5. Name your bank',
      '6. Check the automation is on',
      '7. Make one purchase and watch the line below',
    ])
    expect(para(/Tap Copy at once: the key is shown once/)).toBeInTheDocument()
    expect(para(/replace KEY_HERE with your key\. Keep Bearer and the space after it/)).toBeInTheDocument()
    expect(para(/replace CARD_NAME_HERE in the source field with the word for your bank/)).toBeInTheDocument()
    expect(screen.getByText(/may arrive with its automation switched off; that is not tried yet/)).toBeInTheDocument()
    expect(screen.getByText(/Allow Running When Locked/)).toBeInTheDocument()
    expect(screen.getByText('Waiting for your first payment')).toBeInTheDocument()
  })

  it('names the source words the server rules read, and no others', async () => {
    status(none, null, LINK)
    render(<CaptureSetupSetting />)
    await screen.findByRole('link', { name: 'Add the shortcut' })

    const word = para(/replace CARD_NAME_HERE/).textContent
    expect(word).toContain('Today that is iberia.')
    expect(word).not.toContain('santander')
  })

  it('says the link opens a new window and that the address is in the shortcut, and points the link at that hint', async () => {
    status(none, ADDRESS, LINK)
    render(<CaptureSetupSetting />)
    await screen.findByRole('link', { name: 'Add the shortcut' })

    expect(screen.getByText(/The address it posts to is already in it/)).toBeInTheDocument()
    const link = screen.getByRole('link', { name: 'Add the shortcut' })
    expect(link).toHaveAccessibleDescription(/opens Shortcuts. Add Shortcut page in a new window/i)
  })

  it('shows neither the link nor the manual steps until the status has been read', async () => {
    vi.mocked(statusApi.fetchCaptureStatus).mockReturnValue(new Promise(() => undefined))
    render(<CaptureSetupSetting />)

    await screen.findByText('Checking')
    expect(screen.queryByRole('link', { name: 'Add the shortcut' })).not.toBeInTheDocument()
    expect(screen.queryByText(/Get Contents of URL/)).not.toBeInTheDocument()
  })

  it('falls back to the manual steps when the status cannot be read', async () => {
    vi.mocked(statusApi.fetchCaptureStatus).mockRejectedValue(new Error('Request failed (500)'))
    render(<CaptureSetupSetting />)

    expect(await screen.findByText('4. Add the action')).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Add the shortcut' })).not.toBeInTheDocument()
  })
})

describe('without the shortcut link', () => {
  it('shows the manual steps, one action each, in order, and no Add the shortcut link', async () => {
    render(<CaptureSetupSetting />)
    await screen.findByText('4. Add the action')

    expect(screen.queryByRole('link', { name: 'Add the shortcut' })).not.toBeInTheDocument()
    expect(screen.getAllByText(/^\d+\. /).map((e) => e.textContent)).toEqual([
      '1. Make a key and copy it',
      '2. Start the automation',
      '3. Choose the bank\u2019s app',
      '4. Add the action',
      '5. Type the address',
      '6. Set the method',
      '7. Add the key',
      '8. Choose JSON',
      '9. Add the source field',
      '10. Add the title field',
      '11. Add the body field',
      '12. Add the date field',
      '13. Save it',
      '14. Check the automation is on',
      '15. Make one purchase and watch the line below',
    ])
  })

  it('says exactly what to tap and type, with the address from the server', async () => {
    render(<CaptureSetupSetting />)
    await screen.findByText('5. Type the address')

    expect(para(/Tap the Search bar at the bottom and type Get Contents of URL/)).toBeInTheDocument()
    expect(screen.getByText(ADDRESS)).toBeInTheDocument()
    expect(para(/Change Method from GET to POST/)).toBeInTheDocument()
    expect(para(/Set the text to Bearer \(with a space after it\) followed by your key/)).toBeInTheDocument()
    expect(para(/look for a date format called ISO 8601/)).toBeInTheDocument()
    expect(para(/type the word for your bank: iberia\./)).toBeInTheDocument()
  })
})
