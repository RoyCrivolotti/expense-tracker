import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as device from '../../config/device'
import * as api from '../../data/pushApi'
import { AccountOwnerContext } from '../hooks/accountOwner'
import { PushSetting } from './PushSetting'

vi.mock('../../data/pushApi')
vi.mock('../../config/device', async (importOriginal) => ({ ...(await importOriginal<typeof device>()), devicePlatform: vi.fn(() => 'iphone' as const) }))

const KEY = `B${'A'.repeat(86)}`
const phone: api.PushDeviceInfo = { id: 'dev-1', label: 'iPhone', createdAt: '2026-11-18T20:00:00.000Z', lastSentAt: null, lastStatus: null }
const laptop: api.PushDeviceInfo = { id: 'dev-2', label: 'Mac', createdAt: '2026-11-10T09:00:00.000Z', lastSentAt: '2026-11-17T19:00:00.000Z', lastStatus: 410 }

interface Browser {
  permission: NotificationPermission
  granted?: NotificationPermission
  subscription?: FakeSubscription | null
  standalone?: boolean
}

class FakeSubscription {
  readonly endpoint: string
  constructor(endpoint: string) {
    this.endpoint = endpoint
  }
  toJSON() {
    return { endpoint: this.endpoint, keys: { p256dh: KEY, auth: 'a'.repeat(22) } }
  }
  unsubscribe = vi.fn(() => Promise.resolve(true))
}

const subscribe = vi.fn()
const requestPermission = vi.fn()

/** The browser the card runs in: its permission state, its registration's subscription, and whether it is installed. */
function browser(b: Browser) {
  vi.stubGlobal('Notification', { permission: b.permission, requestPermission: requestPermission.mockResolvedValue(b.granted ?? b.permission) })
  vi.stubGlobal('PushManager', function PushManager() {})
  const registration = { pushManager: { getSubscription: vi.fn(() => Promise.resolve(b.subscription ?? null)), subscribe } }
  Object.defineProperty(navigator, 'serviceWorker', { value: { ready: Promise.resolve(registration) }, configurable: true })
  Object.defineProperty(navigator, 'standalone', { value: b.standalone ?? true, configurable: true })
  return registration
}

const listed = (devices: api.PushDeviceInfo[] = [], settings: api.PushChoice | null = null) =>
  vi.mocked(api.fetchPushDevices).mockResolvedValue({ devices, settings })

function show() {
  return render(
    <AccountOwnerContext value="alice@example.com">
      <PushSetting />
    </AccountOwnerContext>,
  )
}

beforeEach(() => {
  localStorage.clear()
  vi.mocked(api.fetchPushConfig).mockResolvedValue(KEY)
  vi.mocked(api.savePushDevice).mockResolvedValue('dev-1')
  vi.mocked(api.removePushDevice).mockResolvedValue(undefined)
  vi.mocked(api.savePushChoice).mockResolvedValue(undefined)
  subscribe.mockReset()
  requestPermission.mockReset()
  listed()
})
afterEach(() => {
  vi.unstubAllGlobals()
  vi.resetAllMocks()
  vi.mocked(device.devicePlatform).mockReturnValue('iphone')
})

describe('what the card says before anything is on', () => {
  it('sends an iPhone in Safari to the Home Screen first, and reads nothing from the server', async () => {
    browser({ permission: 'default', standalone: false })
    show()
    expect(await screen.findByText(/Add the app to your Home Screen first/)).toBeInTheDocument()
    expect(api.fetchPushConfig).not.toHaveBeenCalled()
  })

  it('says when this browser cannot receive notifications', async () => {
    vi.mocked(device.devicePlatform).mockReturnValue('linux')
    browser({ permission: 'default' })
    vi.unstubAllGlobals()
    show()
    expect(await screen.findByText(/This browser cannot receive notifications/)).toBeInTheDocument()
  })

  it('says when the server has no key', async () => {
    browser({ permission: 'default' })
    vi.mocked(api.fetchPushConfig).mockResolvedValue(null)
    show()
    expect(await screen.findByText('Notifications are not set up on this server.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Turn on for this device' })).not.toBeInTheDocument()
  })

  it('points at the device’s Settings when the person said no before', async () => {
    browser({ permission: 'denied' })
    show()
    expect(await screen.findByText(/off for this app in your device/)).toBeInTheDocument()
  })

  it('shows the reason when the server cannot be read, and reads again on request', async () => {
    browser({ permission: 'default' })
    vi.mocked(api.fetchPushDevices).mockRejectedValueOnce(new Error('Request failed (500)'))
    show()
    expect(await screen.findByRole('alert')).toHaveTextContent('Request failed (500)')
    expect(screen.queryByText('Checking this device.')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByRole('button', { name: 'Turn on for this device' })).toBeInTheDocument()
  })

  it('says this browser cannot receive notifications when no service worker becomes ready', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    browser({ permission: 'granted' })
    Object.defineProperty(navigator, 'serviceWorker', { value: { ready: new Promise(() => undefined) }, configurable: true })
    show()
    await vi.advanceTimersByTimeAsync(5100)
    expect(await screen.findByText(/This browser cannot receive notifications/)).toBeInTheDocument()
    vi.useRealTimers()
  })
})

describe('turning this device on', () => {
  it('asks the permission and subscribes in the same tap, then saves the device with its name and zone', async () => {
    browser({ permission: 'default', granted: 'granted' })
    subscribe.mockResolvedValue(new FakeSubscription('https://web.push.apple.com/new'))
    show()
    fireEvent.click(await screen.findByRole('button', { name: 'Turn on for this device' }))
    await waitFor(() => expect(api.savePushDevice).toHaveBeenCalled())
    expect(requestPermission).toHaveBeenCalledTimes(1)
    const options = subscribe.mock.calls[0]?.[0] as PushSubscriptionOptionsInit
    expect(options.userVisibleOnly).toBe(true)
    expect(options.applicationServerKey).toBeInstanceOf(Uint8Array)
    expect(api.savePushDevice).toHaveBeenCalledWith({ endpoint: 'https://web.push.apple.com/new', keys: { p256dh: KEY, auth: 'a'.repeat(22) } }, 'iPhone', expect.any(String))
    expect(localStorage.getItem('expense:push-device:alice@example.com')).toBe('dev-1')
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Turn on for this device' })).not.toBeInTheDocument())
  })

  it('takes a refusal of the prompt as the device’s answer, and a dismissed prompt as no answer yet', async () => {
    const b = browser({ permission: 'default', granted: 'denied' })
    show()
    fireEvent.click(await screen.findByRole('button', { name: 'Turn on for this device' }))
    await waitFor(() => expect(requestPermission).toHaveBeenCalled())
    // The stubbed permission stays 'default' after the refusal, as a dismissed prompt leaves it.
    expect(await screen.findByRole('button', { name: 'Turn on for this device' })).toBeInTheDocument()
    expect(subscribe).not.toHaveBeenCalled()
    void b
    vi.stubGlobal('Notification', { permission: 'denied', requestPermission: requestPermission.mockResolvedValue('denied') })
    fireEvent.click(screen.getByRole('button', { name: 'Turn on for this device' }))
    expect(await screen.findByText(/off for this app in your device/)).toBeInTheDocument()
  })

  it('saves a subscription the browser holds under no remembered row', async () => {
    browser({ permission: 'granted', subscription: new FakeSubscription('https://web.push.apple.com/held') })
    listed([laptop], { mode: 'daily', timeZone: 'Europe/Madrid' })
    show()
    await waitFor(() => expect(api.savePushDevice).toHaveBeenCalledTimes(1))
    expect(vi.mocked(api.savePushDevice).mock.calls[0]?.[0]).toMatchObject({ endpoint: 'https://web.push.apple.com/held' })
    expect(localStorage.getItem('expense:push-device:alice@example.com')).toBe('dev-1')
  })

  it('lets a subscription go whose row was turned off from another device', async () => {
    localStorage.setItem('expense:push-device:alice@example.com', 'dev-1')
    const held = new FakeSubscription('https://web.push.apple.com/held')
    browser({ permission: 'granted', subscription: held })
    listed([laptop], { mode: 'daily', timeZone: 'Europe/Madrid' })
    show()
    expect(await screen.findByRole('button', { name: 'Turn on for this device' })).toBeInTheDocument()
    expect(held.unsubscribe).toHaveBeenCalledTimes(1)
    expect(api.savePushDevice).not.toHaveBeenCalled()
    expect(localStorage.getItem('expense:push-device:alice@example.com')).toBeNull()
  })

  it('leaves a device the server knows alone', async () => {
    localStorage.setItem('expense:push-device:alice@example.com', 'dev-1')
    browser({ permission: 'granted', subscription: new FakeSubscription('https://web.push.apple.com/held') })
    listed([phone], { mode: 'daily', timeZone: 'Europe/Madrid' })
    show()
    expect(await screen.findByText('iPhone (this device)')).toBeInTheDocument()
    expect(api.savePushDevice).not.toHaveBeenCalled()
  })
})

describe('the devices and the choice, once on', () => {
  beforeEach(() => {
    localStorage.setItem('expense:push-device:alice@example.com', 'dev-1')
    listed([phone, laptop], { mode: 'daily', timeZone: 'Europe/Madrid' })
  })

  it('lists every device with what was sent to it, marks this one, and shows the choice with the zone', async () => {
    browser({ permission: 'granted', subscription: new FakeSubscription('https://web.push.apple.com/held') })
    show()
    expect(await screen.findByText('iPhone (this device)')).toBeInTheDocument()
    expect(screen.getByText('Since 18 Nov · nothing sent yet')).toBeInTheDocument()
    expect(screen.getByText('Mac')).toBeInTheDocument()
    expect(screen.getByText('Since 10 Nov · last sent 17 Nov, not delivered')).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: 'Once a day, at 20:00' })).toBeChecked()
    expect(screen.getByText('Europe/Madrid time')).toBeInTheDocument()
    expect(document.body.textContent).not.toContain('web.push.apple.com')
  })

  it('writes a new choice with this browser’s zone', async () => {
    browser({ permission: 'granted', subscription: new FakeSubscription('https://web.push.apple.com/held') })
    show()
    fireEvent.click(await screen.findByRole('radio', { name: 'Once a week, Monday at 20:00' }))
    await waitFor(() => expect(api.savePushChoice).toHaveBeenCalledTimes(1))
    expect(vi.mocked(api.savePushChoice).mock.calls[0]?.[0]).toMatchObject({ mode: 'weekly' })
    expect(api.fetchPushDevices).toHaveBeenCalledTimes(2)
  })

  it('turns this device off by unsubscribing and forgetting its row, and another device by forgetting its row', async () => {
    const held = new FakeSubscription('https://web.push.apple.com/held')
    browser({ permission: 'granted', subscription: held })
    show()
    fireEvent.click(await screen.findByRole('button', { name: 'Turn off Mac, on since 10 Nov' }))
    await waitFor(() => expect(api.removePushDevice).toHaveBeenCalledWith('dev-2'))
    expect(held.unsubscribe).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Turn off iPhone (this device)' }))
    await waitFor(() => expect(api.removePushDevice).toHaveBeenCalledWith('dev-1'))
    expect(held.unsubscribe).toHaveBeenCalledTimes(1)
    expect(localStorage.getItem('expense:push-device:alice@example.com')).toBeNull()
    expect(await screen.findByRole('button', { name: 'Turn on for this device' })).toBeInTheDocument()
  })
})
