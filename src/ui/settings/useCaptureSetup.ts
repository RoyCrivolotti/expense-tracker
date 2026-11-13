import { useCallback, useEffect, useState } from 'react'
import { fetchCaptureKeys, onCaptureKeysChanged, type CaptureKeyInfo } from '../../data/captureKeysApi'
import { fetchCaptureStatus, type CaptureStatus } from '../../data/captureStatusApi'
import { pastedEndpoint, readSetupMemory, writeSetupMemory, type SetupMemory } from './captureSetup'

function browserStorage(): Storage | null {
  try {
    return window.localStorage
  } catch {
    return null
  }
}

/**
 * What the setup screen shows: whether anything has reached the app, whether a key exists, and what the person has
 * ticked or pasted. Read again when the screen comes back into view, since the person leaves it to build the shortcut,
 * and when a key is made or revoked in the card below.
 */
export function useCaptureSetup() {
  const [status, setStatus] = useState<CaptureStatus | null>(null)
  const [keys, setKeys] = useState<CaptureKeyInfo[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [version, setVersion] = useState(0)
  const [memory, setMemory] = useState<SetupMemory>(() => readSetupMemory(browserStorage()))

  useEffect(() => {
    let current = true
    Promise.all([fetchCaptureStatus(), fetchCaptureKeys()]).then(
      ([s, k]) => {
        if (!current) return
        setStatus(s)
        setKeys(k)
        setError(null)
      },
      (e: unknown) => current && setError(e instanceof Error ? e.message : 'Something went wrong'),
    )
    return () => {
      current = false
    }
  }, [version])

  useEffect(() => {
    const again = () => setVersion((v) => v + 1)
    const onVisible = () => document.visibilityState === 'visible' && again()
    document.addEventListener('visibilitychange', onVisible)
    const off = onCaptureKeysChanged(again)
    return () => {
      document.removeEventListener('visibilitychange', onVisible)
      off()
    }
  }, [])

  const remember = useCallback((next: SetupMemory) => {
    setMemory(next)
    writeSetupMemory(browserStorage(), next)
  }, [])

  return {
    status,
    keys,
    error,
    ticks: new Set(memory.ticks),
    /** The address to show: the server's, else the one the person pasted, else none. */
    endpoint: status?.endpoint ?? pastedEndpoint(memory.endpoint),
    pasted: memory.endpoint,
    serverHasEndpoint: status ? status.endpoint !== null : true,
    tick: (id: string, on: boolean) =>
      remember({ ...memory, ticks: on ? [...new Set([...memory.ticks, id])] : memory.ticks.filter((t) => t !== id) }),
    paste: (text: string) => remember({ ...memory, endpoint: text }),
    recheck: () => setVersion((v) => v + 1),
  }
}
