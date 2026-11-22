import { Card, SectionTitle } from '../components/primitives'
import { failureMessage } from '../hooks/useFailureToast'
import { useToast } from '../hooks/useToast'
import { useGuide } from '../guide/guideContext'
import { useTips } from '../tips/tipsContext'
import styles from './HelpSetting.module.css'

interface Props {
  /** The account has no categories or accounts yet, so setup is a first run and not "again". */
  firstRun: boolean
  onRunSetup: () => void
}

/** Where a person gets back what they put away: the tips on every page, and the setup that sets the account up. */
export function HelpSetting({ firstRun, onRunSetup }: Props) {
  const { showAgain } = useTips()
  const { showToast } = useToast()
  const guide = useGuide()
  const bringBack = () =>
    showAgain().then(
      () => showToast('Tips are back.', 'info'),
      (e: unknown) => showToast(failureMessage(e), 'error'),
    )
  return (
    <>
      <SectionTitle>Help</SectionTitle>
      <Card>
        <p className={styles.hint}>
          {guide ? 'The guide walks through the app from signing in to your first month. ' : ''}
          {firstRun
            ? 'Add your categories and accounts to start tracking spending.'
            : 'Tips on each page go away once you close them. Bring them back, or go through setup again to change your currency, month start, categories and accounts.'}
        </p>
        <div className={styles.actions}>
          {guide ? (
            <button type="button" className={styles.button} onClick={guide.open}>
              Open the guide
            </button>
          ) : null}
          <button type="button" className={styles.button} onClick={() => void bringBack()}>
            Show the tips again
          </button>
          <button type="button" className={styles.button} onClick={onRunSetup}>
            {firstRun ? 'Run setup' : 'Run setup again'}
          </button>
        </div>
      </Card>
    </>
  )
}
