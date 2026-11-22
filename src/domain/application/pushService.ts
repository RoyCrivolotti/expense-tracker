import {
  DEFAULT_PUSH_MODE,
  type PushDevice,
  type PushMode,
  type PushRepository,
  type PushSettings,
} from '../ports/pushRepository'
import { authSecretOf, isPushMode, isTimeZone, p256dhOf, pushServiceEndpointOf } from '../push/subscription'
import { validateLabel } from './labels'
import { ValidationError } from './validationError'

export const MAX_DEVICE_LABEL_LENGTH = 40
const DEFAULT_DEVICE_LABEL = 'Device'

/** What a subscription request must carry: the browser's `PushSubscription.toJSON()`, a label and the zone. */
interface SubscriptionBody {
  endpoint: string
  p256dh: string
  auth: string
  label: string
  timeZone: string
}

function asObject(
  body: unknown,
  what: string,
): Record<string, unknown> {
  if (typeof body !== 'object' || body === null || Array.isArray(body))
    throw new ValidationError(`${what} must be a JSON object`)
  return body as Record<string, unknown>
}

/** Refuses anything that is not a subscription on a known push service. The message names the field, never its value. */
export function validateSubscription(body: unknown): SubscriptionBody {
  const o = asObject(body, 'Request body')
  const endpoint = pushServiceEndpointOf(o.endpoint)
  if (endpoint === null) throw new ValidationError('endpoint must be an https URL on a known push service')
  const keys = asObject(o.keys, 'keys')
  const p256dh = p256dhOf(keys.p256dh)
  if (p256dh === null) throw new ValidationError('keys.p256dh must be a base64url P-256 public key')
  const auth = authSecretOf(keys.auth)
  if (auth === null) throw new ValidationError('keys.auth must be a 16-byte base64url secret')
  if (!isTimeZone(o.timeZone)) throw new ValidationError('timeZone must be a zone name the browser reports')
  return {
    endpoint,
    p256dh,
    auth,
    label: validateLabel(o.label, DEFAULT_DEVICE_LABEL, MAX_DEVICE_LABEL_LENGTH),
    timeZone: o.timeZone,
  }
}

export function validateSettings(body: unknown): { mode: PushMode; timeZone: string } {
  const o = asObject(body, 'Request body')
  if (!isPushMode(o.mode)) throw new ValidationError('mode must be each, daily or weekly')
  if (!isTimeZone(o.timeZone)) throw new ValidationError('timeZone must be a zone name the browser reports')
  return { mode: o.mode, timeZone: o.timeZone }
}

/**
 * Stores a device's subscription for the person, refreshing the row its endpoint already has. A person's first
 * device also gives them the default choice, a daily summary in the zone that device reported; a later device leaves
 * the choice alone. `limit` when they already hold the most devices allowed, and nothing was stored.
 */
export async function savePushDevice(
  repo: PushRepository,
  owner: string,
  body: unknown,
  now: Date,
  newId: () => string,
): Promise<{ id: string } | 'limit'> {
  const sub = validateSubscription(body)
  const id = await repo.saveSubscription({
    id: newId(),
    owner,
    endpoint: sub.endpoint,
    p256dh: sub.p256dh,
    auth: sub.auth,
    label: sub.label,
    createdAt: now.toISOString(),
  })
  if (id === null) return 'limit'
  await repo.saveSettings(owner, { mode: DEFAULT_PUSH_MODE, timeZone: sub.timeZone }, true)
  return { id }
}

export async function listPushDevices(
  repo: PushRepository,
  owner: string,
): Promise<{ devices: PushDevice[]; settings: Omit<PushSettings, 'lastSummaryAt'> | null }> {
  const [devices, settings] = await Promise.all([repo.listDevices(owner), repo.getSettings(owner)])
  return { devices, settings: settings ? { mode: settings.mode, timeZone: settings.timeZone } : null }
}

/** False when the device is not this person's, which an unknown id is not told apart from. */
export function removePushDevice(
  repo: PushRepository,
  owner: string,
  id: string,
): Promise<boolean> {
  return repo.deleteSubscription(owner, id)
}

export async function savePushSettings(
  repo: PushRepository,
  owner: string,
  body: unknown,
): Promise<void> {
  await repo.saveSettings(owner, validateSettings(body), false)
}

/** The VAPID public key the app subscribes with, when the deployment has one that looks like one; otherwise null. */
export function vapidPublicKeyOf(value: string | undefined): string | null {
  return p256dhOf(value)
}
