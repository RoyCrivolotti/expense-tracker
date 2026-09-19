import { useSyncExternalStore } from 'react'

/**
 * Switches for the jitter lab (see JitterLab.tsx), kept as a space-separated list
 * on `<html data-jx>` so plain CSS can key off it and the few JS hooks involved can
 * read it without importing the panel. Persisted so a switch survives a reload.
 */
const STORAGE_KEY = 'jitterLab'
const CHANGE_EVENT = 'jx-change'

export function jxActive(): string[] {
  return (document.documentElement.dataset.jx ?? '').split(' ').filter(Boolean)
}

export function jxOn(flag: string): boolean {
  return jxActive().includes(flag)
}

export function applyJx(flags: string[]): void {
  document.documentElement.dataset.jx = flags.join(' ')
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(flags))
  } catch {
    // Private mode or blocked storage: the switches just do not persist.
  }
  window.dispatchEvent(new Event(CHANGE_EVENT))
}

function restoreJx(): void {
  try {
    const stored: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]')
    if (Array.isArray(stored)) {
      document.documentElement.dataset.jx = stored.filter((f) => typeof f === 'string').join(' ')
    }
  } catch {
    // Unreadable storage leaves every switch off.
  }
}

function subscribe(onChange: () => void): () => void {
  window.addEventListener(CHANGE_EVENT, onChange)
  return () => window.removeEventListener(CHANGE_EVENT, onChange)
}

export function useJx(flag: string): boolean {
  return useSyncExternalStore(subscribe, () => jxOn(flag))
}

restoreJx()
