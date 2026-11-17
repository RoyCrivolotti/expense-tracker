import { req } from './apiClient'

/** A wording the person's dismissals muted: its masked words (never a push's body) and how it was used. */
export interface MutedWording {
  templateId: string
  source: string
  /** The title and text with every number, card, date and code masked, and the merchant once known. */
  skeleton: string
  seen: number
  dismissals: number
  ignoredAt: string
}

export async function fetchMutedWordings(): Promise<MutedWording[]> {
  return (await req<{ templates: MutedWording[] }>('/api/capture-templates?ignored=1')).templates
}

/** Clears the mute, so the next push of that wording is suggested again. */
export async function unmuteWording(templateId: string): Promise<void> {
  await req<{ ok: true }>(`/api/capture-templates/${encodeURIComponent(templateId)}/unignore`, { method: 'POST' })
}
