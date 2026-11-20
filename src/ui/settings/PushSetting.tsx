import { PUSH_MODES, type PushMode } from '../../domain/ports/pushRepository'
import type { PushDeviceInfo } from '../../data/pushApi'
import { Card, SectionTitle } from '../components/primitives'
import { shortDayLabel } from '../format'
import { usePushDevice, type PushDevice } from '../push/usePushDevice'
import tabStyles from '../tabs/tabs.module.css'
import styles from './PushSetting.module.css'

const MODE_LABELS: Record<PushMode, string> = {
  each: 'For every payment, as it arrives',
  daily: 'Once a day, at 20:00',
  weekly: 'Once a week, Monday at 20:00',
}

/** What the chosen mode means for the person, so turning notifications on does not leave them waiting for a push that is not coming. */
const MODE_EXPLAINED: Record<PushMode, string> = {
  each: 'You get a notification for each payment as it arrives.',
  daily: 'You get one summary a day, at 20:00. Choose “For every payment” to hear about each one as it arrives.',
  weekly: 'You get one summary a week, on Monday at 20:00. Choose “For every payment” to hear about each one as it arrives.',
}

const NOT_INSTALLED = 'Add the app to your Home Screen first (Share, then Add to Home Screen), then turn this on from the installed app.'
const UNSUPPORTED = 'This browser cannot receive notifications. Turn them on from the app installed on your phone.'
const NOT_CONFIGURED = 'Notifications are not set up on this server.'
const DENIED = 'Notifications are off for this app in your device’s Settings, Notifications. Allow them there, then come back.'

function sentText(device: PushDeviceInfo): string {
  const since = `Since ${shortDayLabel(device.createdAt.slice(0, 10))}`
  if (device.lastSentAt === null) return `${since} · nothing sent yet`
  const sent = `last sent ${shortDayLabel(device.lastSentAt.slice(0, 10))}`
  return device.lastStatus !== null && device.lastStatus >= 400 ? `${since} · ${sent}, not delivered` : `${since} · ${sent}`
}

function Devices({ push }: { push: PushDevice }) {
  const { list, thisId, busy } = push
  if (list.devices.length === 0) return null
  return (
    <ul className={styles.list}>
      {list.devices.map((device) => (
        <li key={device.id} className={styles.row}>
          <span className={styles.name}>
            <span className={styles.label}>{device.id === thisId ? `${device.label} (this device)` : device.label}</span>
            <span className={styles.meta}>{sentText(device)}</span>
          </span>
          <button
            type="button"
            className={styles.quiet}
            disabled={busy}
            aria-label={device.id === thisId ? `Turn off ${device.label} (this device)` : `Turn off ${device.label}, on since ${shortDayLabel(device.createdAt.slice(0, 10))}`}
            onClick={() => void (device.id === thisId ? push.turnOff() : push.forget(device.id))}
          >
            Turn off
          </button>
        </li>
      ))}
    </ul>
  )
}

function Choice({ push }: { push: PushDevice }) {
  const settings = push.list.settings
  if (!settings) return null
  return (
    <fieldset className={styles.modes}>
      <legend>Tell me</legend>
      {PUSH_MODES.map((mode) => (
        <label key={mode} className={styles.mode}>
          <input type="radio" name="push-mode" checked={settings.mode === mode} disabled={push.busy} onChange={() => void push.choose(mode)} />
          {MODE_LABELS[mode]}
        </label>
      ))}
      <span className={tabStyles.settingHint}>{MODE_EXPLAINED[settings.mode]}</span>
      <span className={styles.meta}>{settings.timeZone.replace(/_/g, ' ')} time</span>
    </fieldset>
  )
}

function Status({ push }: { push: PushDevice }) {
  switch (push.status) {
    case 'loading':
      return <p className={tabStyles.settingHint}>Checking this device.</p>
    case 'not-installed':
      return <p className={tabStyles.settingHint}>{NOT_INSTALLED}</p>
    case 'unsupported':
      return <p className={tabStyles.settingHint}>{UNSUPPORTED}</p>
    case 'not-configured':
      return <p className={tabStyles.settingHint}>{NOT_CONFIGURED}</p>
    case 'denied':
      return <p className={tabStyles.settingHint}>{DENIED}</p>
    case 'off':
      return (
        <button type="button" className={styles.primary} disabled={push.busy} onClick={() => void push.turnOn()}>
          Turn on for this device
        </button>
      )
    case 'failed':
      return (
        <button type="button" className={styles.quiet} onClick={push.retry}>
          Try again
        </button>
      )
    case 'on':
      return null
  }
}

/**
 * Notifications for captured payments on this device, and how the person wants to be told. Turning on asks the
 * permission and subscribes in the same tap; the choice between a push per payment and a daily or weekly summary is
 * the person's, across their devices.
 */
export function PushSetting() {
  const push = usePushDevice()
  return (
    <>
      <SectionTitle>Notifications</SectionTitle>
      <Card>
        <div className={tabStyles.settingGroup}>
          <p className={tabStyles.settingHint}>
            A notification when a captured payment is waiting for a look: tap it to open the payment ready to edit. Each
            device is turned on from that device.
          </p>
          <Status push={push} />
          {push.error ? (
            <p className={tabStyles.settingError} role="alert">
              {push.error}
            </p>
          ) : null}
          <Devices push={push} />
          <Choice push={push} />
        </div>
      </Card>
    </>
  )
}
