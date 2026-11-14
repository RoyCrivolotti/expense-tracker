import { useEffect, useRef, useState } from 'react'
import { Card, SectionTitle } from '../components/primitives'

// SPIKE, DO NOT MERGE. Throwaway device test for how to hand the .shortcut file to iOS from the installed app.
const URL_PATH = '/api/capture-shortcut'
const NAME = 'Expense capture.shortcut'

type Variant = { id: string; label: string; type: string; prefetch: boolean }
const VARIANTS: Variant[] = [
  { id: 'C', label: 'type application/octet-stream, fetch on tap', type: 'application/octet-stream', prefetch: false },
  { id: 'D', label: 'type empty string, fetch on tap', type: '', prefetch: false },
  { id: 'E', label: 'type application/vnd.apple.shortcut (guess), fetch on tap', type: 'application/vnd.apple.shortcut', prefetch: false },
  { id: 'F', label: 'type com.apple.shortcut (the UTI), fetch on tap', type: 'com.apple.shortcut', prefetch: false },
  { id: 'G', label: 'type from the response blob, fetch on tap', type: 'response', prefetch: false },
  { id: 'H', label: 'type application/octet-stream, PRE-FETCHED on mount, share on tap', type: 'application/octet-stream', prefetch: true },
  { id: 'I', label: 'type empty string, PRE-FETCHED on mount, share on tap', type: '', prefetch: true },
]

function describeError(e: unknown) {
  return e instanceof Error ? `${e.name}: ${e.message}` : String(e)
}

export function ShareSpikeCard() {
  const [log, setLog] = useState<Record<string, string>>({})
  const blob = useRef<Blob | null>(null)
  const [prefetch, setPrefetch] = useState('fetching...')

  useEffect(() => {
    fetch(URL_PATH, { credentials: 'same-origin' })
      .then((r) => (r.ok ? r.blob() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((b) => {
        blob.current = b
        setPrefetch(`ready, ${b.size} bytes, blob type "${b.type}"`)
      })
      .catch((e) => setPrefetch(`failed: ${describeError(e)}`))
  }, [])

  const env = `UA: ${navigator.userAgent}\nstandalone: ${String((navigator as Navigator & { standalone?: boolean }).standalone)}\nshare: ${typeof navigator.share}, canShare: ${typeof navigator.canShare}`
  const put = (id: string, text: string) => setLog((l) => ({ ...l, [id]: text }))

  async function run(v: Variant) {
    put(v.id, 'running...')
    try {
      let b = blob.current
      if (!v.prefetch) {
        const r = await fetch(URL_PATH, { credentials: 'same-origin' })
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        b = await r.blob()
      }
      if (!b) throw new Error('pre-fetch has not finished')
      const file = new File([b], NAME, { type: v.type === 'response' ? b.type : v.type })
      const can = navigator.canShare ? String(navigator.canShare({ files: [file] })) : 'no canShare'
      put(v.id, `file type "${file.type}", canShare: ${can}, sharing...`)
      await navigator.share({ files: [file] })
      put(v.id, `file type "${file.type}", canShare: ${can}, share resolved OK`)
    } catch (e) {
      setLog((l) => ({ ...l, [v.id]: `${l[v.id] ?? ''}\nERROR ${describeError(e)}` }))
    }
  }

  return (
    <>
      <SectionTitle>Spike: share the shortcut (do not merge)</SectionTitle>
      <Card>
        <pre style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-all', fontSize: 12 }}>
          {env}
          {'\n'}pre-fetch: {prefetch}
        </pre>
        <p>
          A: <a href={URL_PATH} target="_blank" rel="noopener">New tab link (PR 533)</a>
        </p>
        <p>
          B: <a href={URL_PATH}>Plain link, same window (old)</a>
        </p>
        {VARIANTS.map((v) => (
          <div key={v.id} style={{ marginBottom: 12 }}>
            <button type="button" onClick={() => void run(v)} style={{ minHeight: 44 }}>
              {v.id}: {v.label}
            </button>
            <pre style={{ whiteSpace: 'pre-wrap', fontSize: 12 }}>{log[v.id] ?? ''}</pre>
          </div>
        ))}
      </Card>
    </>
  )
}
