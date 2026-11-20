import { useId } from 'react'
import { devicePlatform, isAppleTouch } from '../../config/device'
import { Card, SectionTitle } from '../components/primitives'
import tabStyles from '../tabs/tabs.module.css'
import { Waiting } from './CaptureSetupCheck'
import styles from './CaptureSetupSetting.module.css'
import { Step, type Setup } from './SetupStep'
import { fileSteps, manualSteps } from './setupSteps'
import { useCaptureSetup } from './useCaptureSetup'

const SHORTCUT_LINK_PREFIX = 'https://www.icloud.com/shortcuts/'

/** The link the steps install from, when the deployment has one. The server already vets it; only an iCloud Shortcuts address is ever used here too. */
function shortcutLink(setup: Setup): string | null {
  const link = setup.status?.shortcutUrl ?? null
  return link?.startsWith(SHORTCUT_LINK_PREFIX) ? link : null
}

const REQUIREMENT =
  'Needs an iPhone or iPad with the Shortcuts app and its notification trigger; proven on iOS 27, untested on older versions. Your version is in Settings, General, About.'
const ELSEWHERE =
  'Capture reads your bank app\u2019s notifications through a Shortcut on your iPhone or iPad. Set it up from Settings on that device; what it captures shows here as well.'
const BY_HAND =
  'A shortcut built by hand from steps like these worked on one phone. It has not been tried on a second phone. We have not seen the iOS 27 screens beyond the trigger, so names here may differ from yours: tell us what does.'
const FROM_LINK =
  'The shortcut was installed from a shared copy on one phone and worked. It has not been tried on a second phone. The names on these screens come from that file and one phone: tell us what differs.'

/**
 * The steps to get a bank app's notifications into the app, and a live check that the first one arrived. Only an iPhone
 * or iPad can run the shortcut, so anywhere else that is known not to be one gets a pointer instead. An unknown device
 * gets the steps: a wrong guess must never hide them from a phone that can use them.
 */
export function CaptureSetupSetting() {
  const platform = devicePlatform()
  return (
    <>
      <SectionTitle>Set up capture</SectionTitle>
      <Card>
        {isAppleTouch(platform) || platform === 'unknown' ? <SetupSteps /> : <p className={tabStyles.settingHint}>{ELSEWHERE}</p>}
      </Card>
    </>
  )
}

function tickedText(count: number, ticked: number): string {
  return `${count} steps, ${ticked === 0 ? 'none ticked' : ticked === count ? 'all ticked' : `${ticked} ticked`}`
}

function SetupSteps() {
  const setup = useCaptureSetup()
  const foldId = useId()
  // Until the status has been read nobody knows which way the card goes, so the steps wait for it.
  const loaded = setup.status !== null || setup.error !== null
  const shortcutUrl = shortcutLink(setup)
  const steps = shortcutUrl ? fileSteps(setup, shortcutUrl) : manualSteps(setup)
  const open = setup.stepsOpen
  return (
    <div className={tabStyles.settingGroup}>
      <p className={tabStyles.settingHint}>
        Capture sends your bank app&rsquo;s notifications from your iPhone or iPad to the app. Each one that shows an amount with its
        currency becomes a payment for you to review; the rest are only counted.
      </p>
      {setup.error ? (
        <p className={tabStyles.settingError} role="alert">
          {setup.error}
        </p>
      ) : null}
      {loaded ? (
        <div>
          <button
            type="button"
            className={styles.toggle}
            aria-expanded={open}
            aria-controls={foldId}
            onClick={() => setup.showSteps(!open)}
          >
            <span>{open ? 'Hide the steps' : 'Show the steps'}</span>
            <span className={styles.toggleCount}>{tickedText(steps.length, steps.filter((s) => setup.ticks.has(s.id)).length)}</span>
          </button>
          {/* Kept in the DOM so it can fold; `inert` keeps touch, focus and screen readers out of what is out of sight. */}
          <div id={foldId} className={open ? styles.fold : `${styles.fold} ${styles.folded}`} inert={!open}>
            <div className={styles.foldInner}>
              <p className={tabStyles.settingHint}>{REQUIREMENT}</p>
              <p className={tabStyles.settingHint}>{shortcutUrl ? FROM_LINK : BY_HAND}</p>
              <ol className={styles.steps}>
                {steps.map((step, i) => (
                  <Step key={step.id} id={step.id} title={`${i + 1}. ${step.title}`} setup={setup}>
                    {step.body}
                  </Step>
                ))}
              </ol>
            </div>
          </div>
        </div>
      ) : null}
      <Waiting setup={setup} />
    </div>
  )
}
