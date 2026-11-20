import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as device from '../../config/device'
import * as keysApi from '../../data/captureKeysApi'
import * as statusApi from '../../data/captureStatusApi'
import { CaptureSetupSetting } from './CaptureSetupSetting'

vi.mock('../../data/captureKeysApi', async (original) => ({
  ...(await original<typeof keysApi>()),
  fetchCaptureKeys: vi.fn(),
}))
vi.mock('../../data/captureStatusApi')
vi.mock('../../config/device', async (original) => ({
  ...(await original<typeof device>()),
  devicePlatform: vi.fn(),
}))

const ADDRESS = 'https://capture.example.workers.dev/capture'
const phone = { keyId: '0123456789abcdef', label: 'My iPhone', createdAt: '2026-11-03T09:00:00.000Z', lastUsedAt: null }
const diagnostics = { received: 0, recommended: 0, grouped: 0, unread: 0, addedAsIs: 0, edited: 0, linked: 0, dismissed: 0, open: 0, muted: 0 }
const none: statusApi.SourceStatus = { source: 'iberia', lastCaptureAt: null, received: 0, unrecognised: 0, diagnostics }

const LINK = 'https://www.icloud.com/shortcuts/abc123'
const status = (iberia = none, endpoint: string | null = ADDRESS, shortcutUrl: string | null = null, malformed = 0) =>
  vi
    .mocked(statusApi.fetchCaptureStatus)
    .mockResolvedValue({ sources: [iberia, { ...none, source: 'santander' }], malformed, endpoint, shortcutUrl })

beforeEach(() => {
  localStorage.clear()
  vi.mocked(device.devicePlatform).mockReturnValue('iphone')
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
    expect(screen.getByText(/Last payment captured today at \d\d:\d\d, from iberia\./)).toBeInTheDocument()
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
    expect(screen.getByText(/Last payment captured yesterday at \d\d:\d\d, from iberia\./)).toBeInTheDocument()
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

  it('reads every source as one, naming the one the newest payment came from', async () => {
    const earlier = new Date(Date.now() - 2 * 86_400_000).toISOString()
    vi.mocked(statusApi.fetchCaptureStatus).mockResolvedValue({
      sources: [
        { ...none, source: 'bank-a', lastCaptureAt: earlier, received: 3, unrecognised: 1 },
        { ...none, source: 'bank-b', lastCaptureAt: new Date().toISOString(), received: 2, unrecognised: 1 },
        { ...none, source: 'bank-c', received: 4, unrecognised: 4 },
      ],
      malformed: 0,
      endpoint: ADDRESS,
      shortcutUrl: null,
    })
    render(<CaptureSetupSetting />)

    expect(await screen.findByText('Last payment captured')).toBeInTheDocument()
    expect(screen.getByText(/from bank-b\. 6 of 9 unread in the last 7 days\./)).toBeInTheDocument()
  })

  it('waits when no source has sent anything yet', async () => {
    vi.mocked(statusApi.fetchCaptureStatus).mockResolvedValue({ sources: [], malformed: 0, endpoint: ADDRESS, shortcutUrl: null })
    render(<CaptureSetupSetting />)

    expect(await screen.findByText('Waiting for your first payment')).toBeInTheDocument()
  })

  it('says how many requests from the shortcut could not be read, rather than that nothing arrived', async () => {
    vi.mocked(statusApi.fetchCaptureStatus).mockResolvedValue({ sources: [], malformed: 3, endpoint: ADDRESS, shortcutUrl: null })
    render(<CaptureSetupSetting />)

    expect(await screen.findByText(/^3 requests from your shortcut in the last 7 days could not be read: check its fields\./)).toBeInTheDocument()
    expect(para(/If your bank app’s name has no Latin letters or digits, add a source field with a short name you type, such as mybank\./)).toBeInTheDocument()
    expect(screen.queryByText(/Nothing has reached the app/)).not.toBeInTheDocument()
  })

  it('says one request could not be read beside a recent payment', async () => {
    status({ ...none, lastCaptureAt: new Date().toISOString(), received: 1 }, ADDRESS, null, 1)
    render(<CaptureSetupSetting />)

    expect(await screen.findByText('Last payment captured')).toBeInTheDocument()
    expect(screen.getByText(/^1 request from your shortcut in the last 7 days could not be read: check its fields\./)).toBeInTheDocument()
  })

  it('says nothing of unreadable requests when there were none', async () => {
    status()
    render(<CaptureSetupSetting />)

    await screen.findByText('Waiting for your first payment')
    expect(screen.queryByText(/could not be read/)).not.toBeInTheDocument()
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

    expect(screen.getByText(/Your version is in Settings, General, About/)).toBeInTheDocument()
    expect(screen.getByText(/built by hand from steps like these worked on one phone/)).toBeInTheDocument()
    expect(screen.getByText(/has not been tried on a second phone/)).toBeInTheDocument()
    expect(screen.getByText(/not seen the iOS 27 screens beyond the trigger/)).toBeInTheDocument()
    expect(screen.getByText(/proven on iOS 27, untested on older versions/)).toBeInTheDocument()
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

describe('on each kind of device', () => {
  it.each(['iphone', 'ipad', 'unknown'] as const)('shows the steps, the requirement and the check on %s', async (platform) => {
    vi.mocked(device.devicePlatform).mockReturnValue(platform)
    render(<CaptureSetupSetting />)

    expect(await screen.findByText('Waiting for your first payment')).toBeInTheDocument()
    expect(screen.getByText(/^Needs an iPhone or iPad with the Shortcuts app and its notification trigger/)).toBeInTheDocument()
    expect(screen.getByText('1. Make a key and copy it')).toBeInTheDocument()
    expect(screen.queryByText(/Set it up from Settings on that device/)).not.toBeInTheDocument()
  })

  it.each(['android', 'mac', 'windows', 'linux'] as const)('points to the iPhone instead on %s, and reads nothing', (platform) => {
    vi.mocked(device.devicePlatform).mockReturnValue(platform)
    render(<CaptureSetupSetting />)

    expect(screen.getByText('Set up capture')).toBeInTheDocument()
    expect(
      screen.getByText(
        'Capture reads your bank app\u2019s notifications through a Shortcut on your iPhone or iPad. Set it up from Settings on that device; what it captures shows here as well.',
      ),
    ).toBeInTheDocument()
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
    expect(screen.queryByText(/Needs an iPhone or iPad/)).not.toBeInTheDocument()
    expect(screen.queryByText('Checking')).not.toBeInTheDocument()
    expect(statusApi.fetchCaptureStatus).not.toHaveBeenCalled()
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
      '5. Check the app field',
      '6. Check the automation is on',
      '7. Make one purchase and watch the line below',
    ])
    expect(para(/Tap Copy at once: the key is shown once/)).toBeInTheDocument()
    expect(para(/replace KEY_HERE with your key\. Keep Bearer and the space after it/)).toBeInTheDocument()
    expect(para(/Leave no empty row under Headers: an empty header makes the request fail before it reaches the app\./)).toBeInTheDocument()
    expect(para(/the app field holds the notification’s App variable/)).toBeInTheDocument()
    expect(screen.getByText(/may arrive with its automation switched off; that is not tried yet/)).toBeInTheDocument()
    expect(para(/keep Automation on, set to run without asking you each time \(on iOS 18 that option is called Run Immediately; on your phone it may be worded differently\)\. Turn on/)).toBeInTheDocument()
    expect(screen.getByText(/Allow Running When Locked/)).toBeInTheDocument()
    expect(screen.getByText('Waiting for your first payment')).toBeInTheDocument()
  })

  it('asks for nothing typed for the bank, says how to swap an old source placeholder, and keeps a typed source', async () => {
    status(none, null, LINK)
    render(<CaptureSetupSetting />)
    await screen.findByRole('link', { name: 'Add the shortcut' })

    const step = para(/the app field holds/).textContent
    expect(step).toContain('If your copy has a source field with CARD_NAME_HERE instead, delete it')
    expect(step).toContain('An older shortcut that sends a source name instead keeps working: leave it.')
    expect(step).not.toMatch(/lowercase|iberia|santander/i)
  })

  it('says the link opens a new window and that the address is in the shortcut, and points the link at that hint', async () => {
    status(none, ADDRESS, LINK)
    render(<CaptureSetupSetting />)
    await screen.findByRole('link', { name: 'Add the shortcut' })

    expect(screen.getByText(/The address it posts to is already in it/)).toBeInTheDocument()
    const link = screen.getByRole('link', { name: 'Add the shortcut' })
    expect(link).toHaveAccessibleDescription(/opens Shortcuts. Add Shortcut page in a new window/i)
  })

  it.each(['https://example.com/shortcuts/abc123', 'javascript:alert(1)', 'http://www.icloud.com/shortcuts/abc123'])(
    'shows the manual steps and no link when the status carries %s',
    async (url) => {
      status(none, null, url)
      render(<CaptureSetupSetting />)

      expect(await screen.findByText('5. Add the action')).toBeInTheDocument()
      expect(screen.queryByRole('link', { name: 'Add the shortcut' })).not.toBeInTheDocument()
    },
  )

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

    expect(await screen.findByText('5. Add the action')).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Add the shortcut' })).not.toBeInTheDocument()
  })
})

describe('without the shortcut link', () => {
  it('shows the manual steps, one action each, in order, and no Add the shortcut link', async () => {
    render(<CaptureSetupSetting />)
    await screen.findByText('5. Add the action')

    expect(screen.queryByRole('link', { name: 'Add the shortcut' })).not.toBeInTheDocument()
    expect(screen.getAllByText(/^\d+\. /).map((e) => e.textContent)).toEqual([
      '1. Make a key and copy it',
      '2. Start the automation',
      '3. Choose the bank\u2019s app',
      '4. Let it run without asking',
      '5. Add the action',
      '6. Enter the address',
      '7. Set the method',
      '8. Add the key',
      '9. Choose JSON',
      '10. Add the app field',
      '11. Add the title field',
      '12. Add the body field',
      '13. Add the date field',
      '14. Save it',
      '15. Check the automation is on',
      '16. Make one purchase and watch the line below',
    ])
  })

  it('says exactly what to tap and type, with the address from the server', async () => {
    render(<CaptureSetupSetting />)
    await screen.findByText('6. Enter the address')

    expect(para(/choose the option that runs the automation without asking you each time; with the other one, every payment waits for you to tap\. On iOS 18 the two are called Run Immediately and Run After Confirmation; on your phone they may be worded differently\. Then tap Next\./)).toBeInTheDocument()
    expect(para(/choose New Blank Automation\. Tap the Search bar at the bottom and type Get Contents of URL/)).toBeInTheDocument()
    expect(para(/Tap Copy here, then in the action tap URL and paste\. The \/capture at the end is part of the address/)).toBeInTheDocument()
    const check = para(/keep Automation on, still set to run without asking, as you chose when you made it\. Turn on/)
    expect(check.textContent).not.toMatch(/Run Immediately|Run After Confirmation/)
    expect(screen.getByText(ADDRESS)).toBeInTheDocument()
    expect(para(/Change Method from GET to POST/)).toBeInTheDocument()
    expect(para(/Set the text to Bearer \(with a space after it\) followed by your key/)).toBeInTheDocument()
    expect(para(/look for a date format called ISO 8601/)).toBeInTheDocument()
    expect(para(/followed by your key\. Leave no empty row under Headers/)).toBeInTheDocument()
    expect(para(/set the key to app\. Tap the value field, choose the notification’s variable, then pick App\. The app files/)).toBeInTheDocument()
    expect(para(/An older shortcut that sends a source name instead keeps working/)).toBeInTheDocument()
  })
})

describe('opening and closing the steps', () => {
  const captured = { ...none, lastCaptureAt: new Date().toISOString(), received: 1 }
  const toggle = () => screen.getByRole('button', { name: /the steps/ })
  const fold = () => document.getElementById(toggle().getAttribute('aria-controls') ?? '')

  it('has them open while no payment has been captured, with how many are ticked', async () => {
    render(<CaptureSetupSetting />)
    await screen.findByText('Waiting for your first payment')

    expect(toggle()).toHaveAttribute('aria-expanded', 'true')
    expect(toggle()).toHaveTextContent('Hide the steps')
    expect(toggle()).toHaveTextContent('16 steps, none ticked')
    expect(fold()).not.toHaveAttribute('inert')
    expect(fold()).toContainElement(screen.getByText('1. Make a key and copy it'))
    expect(fold()).toContainElement(screen.getByText(/^Needs an iPhone or iPad/))
  })

  it('has them closed once a payment has been captured, out of reach but one tap away, with the check still showing', async () => {
    status(captured, null, LINK)
    render(<CaptureSetupSetting />)
    await screen.findByText('Last payment captured')

    expect(toggle()).toHaveAttribute('aria-expanded', 'false')
    expect(toggle()).toHaveTextContent('Show the steps')
    expect(toggle()).toHaveTextContent('7 steps, none ticked')
    expect(fold()).toHaveAttribute('inert')
    expect(fold()?.className).toContain('folded')
    expect(fold()).not.toContainElement(screen.getByText('Last payment captured'))

    fireEvent.click(toggle())
    expect(toggle()).toHaveAttribute('aria-expanded', 'true')
    expect(fold()).not.toHaveAttribute('inert')
    expect(fold()?.className).not.toContain('folded')
  })

  it('keeps them open while pushes arrive but none was ever read as a payment', async () => {
    status({ ...none, received: 4, unrecognised: 4 })
    render(<CaptureSetupSetting />)
    await screen.findByText('Arriving, not read as a payment')

    expect(toggle()).toHaveAttribute('aria-expanded', 'true')
  })

  it('lets the person’s own choice win over the default, on the next visit too, and keeps the focus on the button', async () => {
    const first = render(<CaptureSetupSetting />)
    await screen.findByText('Waiting for your first payment')
    toggle().focus()
    fireEvent.click(toggle())

    expect(toggle()).toHaveAttribute('aria-expanded', 'false')
    expect(toggle()).toHaveFocus()
    first.unmount()
    const second = render(<CaptureSetupSetting />)
    await screen.findByText('Waiting for your first payment')
    expect(toggle()).toHaveAttribute('aria-expanded', 'false')

    fireEvent.click(toggle())
    second.unmount()
    status(captured)
    render(<CaptureSetupSetting />)
    await screen.findByText('Last payment captured')
    expect(toggle()).toHaveAttribute('aria-expanded', 'true')
  })

  it('counts the ticks of the steps on show', async () => {
    render(<CaptureSetupSetting />)
    fireEvent.click(await screen.findByRole('checkbox', { name: /1\. Make a key and copy it/ }))
    expect(toggle()).toHaveTextContent('16 steps, 1 ticked')

    for (const box of screen.getAllByRole('checkbox')) if (!(box as HTMLInputElement).checked) fireEvent.click(box)
    expect(toggle()).toHaveTextContent('16 steps, all ticked')
  })

  it('still opens and closes in a browser that refuses storage', async () => {
    const refuse = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('denied')
    })
    render(<CaptureSetupSetting />)
    await screen.findByText('Waiting for your first payment')

    fireEvent.click(toggle())
    expect(toggle()).toHaveAttribute('aria-expanded', 'false')
    refuse.mockRestore()
  })

  it('offers no steps to open until the status has been read', async () => {
    vi.mocked(statusApi.fetchCaptureStatus).mockReturnValue(new Promise(() => undefined))
    render(<CaptureSetupSetting />)

    await screen.findByText('Checking')
    expect(screen.queryByRole('button', { name: /the steps/ })).not.toBeInTheDocument()
  })
})

describe('when adding the shared shortcut did not work', () => {
  const byHand = () => screen.getByRole('button', { name: 'Set it up by hand' })
  const back = () => screen.getByRole('button', { name: 'Back to the shared shortcut' })
  const titles = () => screen.getAllByText(/^\d+\. /).map((e) => e.textContent)

  it('offers the manual steps from the Add the shortcut step, and swaps the list for them', async () => {
    status(none, ADDRESS, LINK)
    render(<CaptureSetupSetting />)
    await screen.findByRole('link', { name: 'Add the shortcut' })
    expect(screen.getByText('The shortcut did not install, or the page did not open?')).toBeInTheDocument()
    expect(screen.getByText('2. Add the shortcut').closest('li')).toContainElement(byHand())

    fireEvent.click(byHand())

    expect(titles()).toHaveLength(16)
    expect(titles().slice(0, 6)).toEqual([
      '1. Make a key and copy it',
      '2. Start the automation',
      '3. Choose the bank\u2019s app',
      '4. Let it run without asking',
      '5. Add the action',
      '6. Enter the address',
    ])
    expect(screen.getByText(ADDRESS)).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Add the shortcut' })).not.toBeInTheDocument()
    expect(screen.getByText(/built by hand from steps like these worked on one phone/)).toBeInTheDocument()
    expect(screen.queryByText(/installed from a shared copy/)).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /the steps/ })).toHaveTextContent('16 steps, none ticked')
  })

  it('goes back to the shared shortcut, moving the focus to the button that undoes each swap', async () => {
    status(none, ADDRESS, LINK)
    render(<CaptureSetupSetting />)
    await screen.findByRole('link', { name: 'Add the shortcut' })

    fireEvent.click(byHand())
    expect(back()).toHaveFocus()
    fireEvent.click(back())

    expect(screen.getByRole('link', { name: 'Add the shortcut' })).toBeInTheDocument()
    expect(byHand()).toHaveFocus()
    expect(titles()).toHaveLength(7)
  })

  it('keeps the choice and the ticks of the steps both lists share for the next visit', async () => {
    status(none, ADDRESS, LINK)
    const first = render(<CaptureSetupSetting />)
    fireEvent.click(await screen.findByRole('checkbox', { name: /1\. Make a key and copy it/ }))
    fireEvent.click(byHand())
    first.unmount()
    render(<CaptureSetupSetting />)

    expect(await screen.findByText('5. Add the action')).toBeInTheDocument()
    expect(screen.getByRole('checkbox', { name: /1\. Make a key and copy it/ })).toBeChecked()
    expect(back()).not.toHaveFocus()
  })

  it('offers no way back where there is no shared shortcut to go back to', async () => {
    localStorage.setItem('expenses-capture-setup', JSON.stringify({ byHand: true }))
    render(<CaptureSetupSetting />)

    await screen.findByText('5. Add the action')
    expect(screen.queryByRole('button', { name: 'Back to the shared shortcut' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Set it up by hand' })).not.toBeInTheDocument()
  })

  it.each(['android', 'mac', 'windows', 'linux'] as const)('shows neither list on %s', (platform) => {
    vi.mocked(device.devicePlatform).mockReturnValue(platform)
    localStorage.setItem('expenses-capture-setup', JSON.stringify({ byHand: true }))
    status(none, ADDRESS, LINK)
    render(<CaptureSetupSetting />)

    expect(screen.queryByRole('button', { name: /by hand|shared shortcut|the steps/ })).not.toBeInTheDocument()
    expect(screen.queryByText(/Get Contents of URL/)).not.toBeInTheDocument()
  })
})
