import { useCallback, useEffect, useState } from 'react'
import { fetchMutedWordings, unmuteWording, type MutedWording } from '../../data/captureTemplatesApi'
import { shortDayLabel } from '../format'
import { Card, SectionTitle } from '../components/primitives'
import tabStyles from '../tabs/tabs.module.css'
import keyStyles from './CaptureKeySetting.module.css'
import styles from './CaptureMutedSetting.module.css'
import { wordingParts, wordingText } from './mutedWording'

const EMPTY = 'Nothing is muted. A wording you dismiss three times in a row stops being suggested and appears here.'

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : 'Something went wrong'
}

const pad = (n: number) => String(n).padStart(2, '0')
/** The phone's own calendar day of an instant. */
const dayOf = (iso: string) => {
  const at = new Date(iso)
  return `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}`
}

const times = (n: number) => (n === 1 ? 'once' : `${n} times`)

/** The muted list, read again after each un-mute so it shows what the server now holds. */
function useMutedList() {
  const [found, setFound] = useState<MutedWording[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [version, setVersion] = useState(0)

  useEffect(() => {
    let current = true
    fetchMutedWordings().then(
      (list) => current && setFound(list),
      (e: unknown) => current && setError(messageOf(e)),
    )
    return () => {
      current = false
    }
  }, [version])

  const unmute = useCallback(async (templateId: string) => {
    setBusy(true)
    setError(null)
    try {
      await unmuteWording(templateId)
      setVersion((v) => v + 1)
    } catch (e) {
      setError(messageOf(e))
    } finally {
      setBusy(false)
    }
  }, [])
  return { found, error, busy, unmute }
}

/**
 * The masked words: each number, card, date and code shown as what it is, and the merchant too once a second push of
 * the wording has shown where it sits. Until then the first push's merchant is among the words.
 */
function Wording({ skeleton }: { skeleton: string }) {
  return (
    <p className={styles.wording}>
      {wordingParts(skeleton).map((part, i) =>
        'slot' in part ? (
          <span key={i} className={styles.slot}>
            {part.slot}
          </span>
        ) : (
          <span key={i}>{` ${part.text} `}</span>
        ),
      )}
    </p>
  )
}

function MutedRow({ wording, busy, onUnmute }: { wording: MutedWording; busy: boolean; onUnmute: () => void }) {
  const day = shortDayLabel(dayOf(wording.ignoredAt))
  return (
    <li className={keyStyles.row}>
      <span className={keyStyles.name}>
        <Wording skeleton={wording.skeleton} />
        <span className={keyStyles.meta}>
          {wording.source} · seen {times(wording.seen)}, dismissed {times(wording.dismissals)} · muted {day}
        </span>
      </span>
      <button
        type="button"
        className={keyStyles.quiet}
        disabled={busy}
        aria-label={`Suggest again the ${wording.source} wording: ${wordingText(wording.skeleton)}`}
        onClick={onUnmute}
      >
        Suggest again
      </button>
    </li>
  )
}

/**
 * The wordings the person's dismissals muted: three in a row on a wording never added. Their pushes are still counted,
 * and "Suggest again" brings the wording back. Shows the masked words (`Wording`), never a push's body.
 */
export function CaptureMutedSetting() {
  const { found, error, busy, unmute } = useMutedList()
  return (
    <>
      <SectionTitle>Muted pushes</SectionTitle>
      <Card>
        <div className={tabStyles.settingGroup}>
          <p className={tabStyles.settingHint}>
            {found && found.length === 0
              ? EMPTY
              : 'A wording you dismissed three times in a row, and never added, is counted but not suggested. Suggest again brings it back. Numbers, cards, dates and codes are masked; a merchant is masked once a second push of the wording has shown where it sits.'}
          </p>
          {error ? (
            <p className={tabStyles.settingError} role="alert">
              {error}
            </p>
          ) : null}
          {found && found.length > 0 ? (
            <ul className={keyStyles.list}>
              {found.map((wording) => (
                <MutedRow
                  key={wording.templateId}
                  wording={wording}
                  busy={busy}
                  onUnmute={() => void unmute(wording.templateId)}
                />
              ))}
            </ul>
          ) : null}
        </div>
      </Card>
    </>
  )
}
