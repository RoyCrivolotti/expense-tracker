import { useCallback, useEffect, useState } from 'react'
import {
  createCaptureKey,
  fetchCaptureKeys,
  revokeCaptureKey,
  type CaptureKeyInfo,
  type CreatedCaptureKey,
} from '../../data/captureKeysApi'

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : 'Something went wrong'
}

/**
 * The person's capture keys and the three things they can do with them. A key just made is held here, whole, until
 * the person dismisses it or leaves: the server will not show it again.
 */
export function useCaptureKeys() {
  const [keys, setKeys] = useState<CaptureKeyInfo[] | null>(null)
  const [fresh, setFresh] = useState<CreatedCaptureKey | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  // Bumped after a change, so the list is read again from the server rather than patched by hand.
  const [version, setVersion] = useState(0)

  useEffect(() => {
    let current = true
    fetchCaptureKeys().then(
      (list) => current && setKeys(list),
      (e: unknown) => current && setError(messageOf(e)),
    )
    return () => {
      current = false
    }
  }, [version])

  const act = useCallback(async (run: () => Promise<void>) => {
    setBusy(true)
    setError(null)
    try {
      await run()
      setVersion((v) => v + 1)
    } catch (e) {
      setError(messageOf(e))
    } finally {
      setBusy(false)
    }
  }, [])

  return {
    keys,
    fresh,
    error,
    busy,
    create: (label: string) => act(async () => setFresh(await createCaptureKey(label))),
    revoke: (keyId: string) => act(() => revokeCaptureKey(keyId)),
    dismissFresh: () => setFresh(null),
  }
}
