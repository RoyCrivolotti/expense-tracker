import { devicePlatform, isAppleTouch } from '../../config/device'
import { Card, SectionTitle } from '../components/primitives'
import tabStyles from '../tabs/tabs.module.css'
import { Waiting } from './CaptureSetupCheck'
import styles from './CaptureSetupSetting.module.css'
import { Step, type Setup } from './SetupStep'
import { fileSteps, manualSteps } from './setupSteps'
import { useCaptureSetup } from './useCaptureSetup'

const SHORTCUT_LINK_PREFIX = 'https://www.icloud.com/shortcuts/'

function Steps({ setup }: { setup: Setup }) {
  // Until the status has been read nobody knows which way the card goes, so the steps wait for it.
  const loaded = setup.status !== null || setup.error !== null
  const link = setup.status?.shortcutUrl ?? null
  // The server already vets the link; only an iCloud Shortcuts address is ever rendered as a button here too.
  const shortcutUrl = link?.startsWith(SHORTCUT_LINK_PREFIX) ? link : null
  const steps = !loaded ? [] : shortcutUrl ? fileSteps(setup, shortcutUrl) : manualSteps(setup)
  return (
    <ol className={styles.steps}>
      {steps.map((step, i) => (
        <Step key={step.id} id={step.id} title={`${i + 1}. ${step.title}`} setup={setup}>
          {step.body}
        </Step>
      ))}
      <Waiting setup={setup} />
    </ol>
  )
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

function SetupSteps() {
  const setup = useCaptureSetup()
  return (
    <div className={tabStyles.settingGroup}>
      <p className={tabStyles.settingHint}>
        Capture sends your bank app&rsquo;s notifications from your iPhone or iPad to the app. Each one that shows an amount with its
        currency becomes a payment for you to review; the rest are only counted.
      </p>
      <p className={tabStyles.settingHint}>{REQUIREMENT}</p>
      <p className={tabStyles.settingHint}>{setup.status?.shortcutUrl?.startsWith(SHORTCUT_LINK_PREFIX) ? FROM_LINK : BY_HAND}</p>
      {setup.error ? (
        <p className={tabStyles.settingError} role="alert">
          {setup.error}
        </p>
      ) : null}
      <Steps setup={setup} />
    </div>
  )
}
