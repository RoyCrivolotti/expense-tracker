import type { PushMode } from '../domain/ports/pushRepository'
import { req } from './apiClient'

/** A device as the list shows it: never its endpoint or keys. */
export interface PushDeviceInfo {
  id: string
  label: string
  createdAt: string
  lastSentAt: string | null
  lastStatus: number | null
}

export interface PushChoice {
  mode: PushMode
  timeZone: string
}

export interface PushDevices {
  devices: PushDeviceInfo[]
  settings: PushChoice | null
}

/** The key to subscribe with, or null when this deployment has none. */
export async function fetchPushConfig(): Promise<string | null> {
  return (await req<{ publicKey: string | null }>('/api/push-config')).publicKey
}

export function fetchPushDevices(): Promise<PushDevices> {
  return req<PushDevices>('/api/push-subscriptions')
}

/** What the browser's `PushSubscription.toJSON()` gives. */
export interface SubscriptionJson {
  endpoint?: string | undefined
  keys?: Record<string, string> | undefined
}

export async function savePushDevice(
  subscription: SubscriptionJson,
  label: string,
  timeZone: string,
): Promise<string> {
  const json = { endpoint: subscription.endpoint, keys: subscription.keys, label, timeZone }
  return (
    await req<{ id: string }>('/api/push-subscriptions', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(json),
    })
  ).id
}

export async function removePushDevice(id: string): Promise<void> {
  await req<{ ok: true }>(`/api/push-subscriptions/${encodeURIComponent(id)}`, { method: 'DELETE' })
}

export async function savePushChoice(choice: PushChoice): Promise<void> {
  await req<{ ok: true }>('/api/push-settings', {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(choice),
  })
}
