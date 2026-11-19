/** Devices a person may hold subscriptions for. A phone, a tablet and a laptop or two; the rest is a mistake. */
export const MAX_PUSH_DEVICES = 10

/** How a person is told about captured payments: a push per payment as it arrives, or one summary a day or a week. */
export const PUSH_MODES = ['each', 'daily', 'weekly'] as const
export type PushMode = (typeof PUSH_MODES)[number]
/** What a person gets until they choose: a summary each evening. */
export const DEFAULT_PUSH_MODE: PushMode = 'daily'

/** What the browser handed the app for one device, as the server keeps it. */
export interface NewPushSubscription {
  id: string
  owner: string
  /** The push service's URL for the device. */
  endpoint: string
  /** The device's public key, base64url. */
  p256dh: string
  /** The device's auth secret, base64url. */
  auth: string
  label: string
  createdAt: string
}

/** A device as the person sees it in Settings: never the endpoint or the keys. */
export interface PushDevice {
  id: string
  label: string
  createdAt: string
  lastSentAt: string | null
  /** The push service's last answer to a send, or null before the first. */
  lastStatus: number | null
}

export interface PushSettings {
  mode: PushMode
  /** A zone name `Intl` accepts, the browser's own when the choice was saved. */
  timeZone: string
  lastSummaryAt: string | null
}

/** Persistence for web push. Every method is scoped by owner. Times are ISO strings in UTC, passed in. */
export interface PushRepository {
  /**
   * Stores a device's subscription for its owner. An endpoint already stored is refreshed in place, whoever it
   * belonged to: the subscription serves the person signed in on that device now. Null, and nothing written, when
   * the owner already holds the most devices allowed, decided inside the insert. Answers the row's id.
   */
  saveSubscription(subscription: NewPushSubscription): Promise<string | null>
  listDevices(owner: string): Promise<PushDevice[]>
  /** False when the id is not this person's. */
  deleteSubscription(owner: string, id: string): Promise<boolean>
  getSettings(owner: string): Promise<PushSettings | null>
  /** Writes the person's choice. With `onlyIfMissing` an existing row is left as it is, which is how a first device gets the default. */
  saveSettings(owner: string, settings: { mode: PushMode; timeZone: string }, onlyIfMissing: boolean): Promise<void>
}
