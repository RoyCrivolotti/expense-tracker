import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as device from '../../config/device'
import * as keysApi from '../../data/captureKeysApi'
import * as statusApi from '../../data/captureStatusApi'
import { setMotionDisabledForTests } from '../hooks/motion'
import { TipsProvider } from '../tips/TipsProvider'
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

const key = { keyId: '0123456789abcdef', label: 'My iPhone', createdAt: '2026-11-03T09:00:00.000Z', lastUsedAt: null }
const diagnostics = {
  received: 0,
  recommended: 0,
  grouped: 0,
  unread: 0,
  addedAsIs: 0,
  edited: 0,
  linked: 0,
  dismissed: 0,
  open: 0,
  muted: 0,
}
const none: statusApi.SourceStatus = {
  source: 'iberia',
  lastCaptureAt: null,
  received: 0,
  unrecognised: 0,
  diagnostics,
}

const region = () => screen.queryByRole('region', { name: 'Capture (optional)' })
const toggle = () => screen.getByRole('button', { name: /(Show|Hide) the steps/ })

function show(opts: { saved?: string[] | undefined; save?: (() => Promise<void>) | undefined } = {}) {
  const save = 'save' in opts ? opts.save : () => Promise.resolve()
  return render(
    <TipsProvider saved={'saved' in opts ? opts.saved : []} hasTransactions save={save}>
      <CaptureSetupSetting />
    </TipsProvider>,
  )
}

beforeEach(() => {
  setMotionDisabledForTests(true)
  localStorage.clear()
  vi.mocked(device.devicePlatform).mockReturnValue('iphone')
  vi.mocked(keysApi.fetchCaptureKeys).mockResolvedValue([])
  vi.mocked(statusApi.fetchCaptureStatus).mockResolvedValue({
    sources: [none, { ...none, source: 'santander' }],
    malformed: 0,
    endpoint: 'https://capture.example.workers.dev/capture',
    shortcutUrl: null,
  })
})
afterEach(() => {
  cleanup()
  vi.resetAllMocks()
})

describe('the Capture card', () => {
  it.each(['iphone', 'ipad', 'unknown'] as const)(
    'says what capture is, needs and costs on %s before the steps, to a person with no key',
    async (platform) => {
      vi.mocked(device.devicePlatform).mockReturnValue(platform)
      show()
      expect(await screen.findByRole('region', { name: 'Capture (optional)' })).toBeInTheDocument()
      expect(
        screen.getByText(/Turns your bank app.s payment notifications into payments to confirm with a tap/),
      ).toBeInTheDocument()
      expect(screen.getByText('Needs an iPhone or iPad with the Shortcuts app, tested on iOS 27.')).toBeInTheDocument()
      expect(screen.getByText('Takes about ten minutes, once per device.')).toBeInTheDocument()
      expect(screen.getByText('Adding payments by hand always works without it.')).toBeInTheDocument()
      const card = region()!
      const steps = screen.getByText('Set up capture')
      expect(card.compareDocumentPosition(steps) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    },
  )

  it('waits for the keys to be read, and is not there when a key exists, which puts it away for good', async () => {
    vi.mocked(keysApi.fetchCaptureKeys).mockResolvedValue([key])
    const save = vi.fn(() => Promise.resolve())
    show({ save })
    await screen.findByText('Waiting for your first payment')
    expect(region()).toBeNull()
    await waitFor(() => expect(save).toHaveBeenCalledWith({ tipsSeen: ['capture'] }))
  })

  it('does not come back when the last key is revoked later', async () => {
    vi.mocked(keysApi.fetchCaptureKeys).mockResolvedValueOnce([key]).mockResolvedValue([])
    const view = show()
    await screen.findByText('Waiting for your first payment')
    await act(() => Promise.resolve())
    view.unmount()
    // The saved list now holds it, as a second visit with the key gone would read it.
    show({ saved: ['capture'] })
    await screen.findByText('Waiting for your first payment')
    expect(region()).toBeNull()
  })

  it('is not there while the keys are still being read, and nor is the box that would be pushed down when it comes', () => {
    vi.mocked(keysApi.fetchCaptureKeys).mockReturnValue(new Promise(() => undefined))
    show()
    expect(region()).toBeNull()
    expect(screen.queryByText('Set up capture')).toBeNull()
  })

  it('is not there when the keys cannot be read', async () => {
    vi.mocked(keysApi.fetchCaptureKeys).mockRejectedValue(new Error('offline'))
    show()
    await screen.findByRole('alert')
    expect(region()).toBeNull()
  })

  it('Start setup opens the steps a person had closed, and puts the card away on the account', async () => {
    localStorage.setItem('expenses-capture-setup', JSON.stringify({ steps: 'closed' }))
    const save = vi.fn(() => Promise.resolve())
    show({ save })
    await screen.findByRole('region', { name: 'Capture (optional)' })
    await waitFor(() => expect(toggle()).toHaveAttribute('aria-expanded', 'false'))

    fireEvent.click(screen.getByRole('button', { name: 'Start setup' }))
    await act(() => Promise.resolve())

    expect(region()).toBeNull()
    expect(toggle()).toHaveAttribute('aria-expanded', 'true')
    // The person is taken to the steps, which are under the card that has gone.
    expect(document.activeElement).toBe(toggle())
    expect(save).toHaveBeenCalledWith({ tipsSeen: ['capture'] })
  })

  it('takes the focus to the steps even when they were already open, which is how a new person finds them', async () => {
    show()
    await screen.findByRole('region', { name: 'Capture (optional)' })
    await waitFor(() => expect(toggle()).toHaveAttribute('aria-expanded', 'true'))

    fireEvent.click(screen.getByRole('button', { name: 'Start setup' }))

    expect(document.activeElement).toBe(toggle())
  })

  it('hands the focus on when Not now is pressed, rather than dropping it', async () => {
    show()
    await screen.findByRole('region', { name: 'Capture (optional)' })
    screen.getByRole('button', { name: 'Not now' }).focus()

    fireEvent.click(screen.getByRole('button', { name: 'Not now' }))

    // On to the next control after the card, which is where the steps begin.
    expect(document.activeElement).toBe(toggle())
  })

  it('Not now puts the card away and leaves the steps as they were', async () => {
    localStorage.setItem('expenses-capture-setup', JSON.stringify({ steps: 'closed' }))
    const save = vi.fn(() => Promise.resolve())
    show({ save })
    await screen.findByRole('region', { name: 'Capture (optional)' })
    await waitFor(() => expect(toggle()).toHaveAttribute('aria-expanded', 'false'))

    fireEvent.click(screen.getByRole('button', { name: 'Not now' }))
    await act(() => Promise.resolve())

    expect(region()).toBeNull()
    expect(toggle()).toHaveAttribute('aria-expanded', 'false')
    expect(save).toHaveBeenCalledWith({ tipsSeen: ['capture'] })
  })

  it('is not shown to an established account, nor where nothing can be saved', async () => {
    show({ saved: undefined })
    await screen.findByText('Waiting for your first payment')
    expect(region()).toBeNull()
    cleanup()
    show({ save: undefined })
    await screen.findByText('Waiting for your first payment')
    expect(region()).toBeNull()
  })

  it.each(['android', 'mac', 'windows', 'linux'] as const)(
    'is not drawn on %s, which says in its own words that capture is not there',
    (platform) => {
      vi.mocked(device.devicePlatform).mockReturnValue(platform)
      show()
      expect(screen.getByText(/It does not exist on Android or on a computer\./)).toBeInTheDocument()
      expect(region()).toBeNull()
      expect(keysApi.fetchCaptureKeys).not.toHaveBeenCalled()
    },
  )
})
