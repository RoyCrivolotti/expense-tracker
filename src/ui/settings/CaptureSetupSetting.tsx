import { Card, SectionTitle } from '../components/primitives'
import tabStyles from '../tabs/tabs.module.css'
import { Waiting } from './CaptureSetupCheck'
import styles from './CaptureSetupSetting.module.css'
import { Step, type Setup } from './SetupStep'
import { linkSteps, manualSteps } from './setupSteps'
import { useCaptureSetup } from './useCaptureSetup'

function Steps({ setup }: { setup: Setup }) {
  // Until the status has been read nobody knows which way the card goes, so the steps wait for it.
  const loaded = setup.status !== null || setup.error !== null
  const link = setup.status?.shortcutUrl ?? null
  const steps = !loaded ? [] : link ? linkSteps(setup, link) : manualSteps(setup)
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

const IOS_NOTE =
  'This needs an iPhone on iOS 27 or later: the trigger was seen on iOS 27. We have not tried an older iPhone or Android. This screen cannot tell your version; check Settings, General, About.'
const BY_HAND =
  'A shortcut built by hand from steps like these worked on one phone. It has not been tried on a second phone. We have not seen the iOS 27 screens beyond the trigger, so names here may differ from yours: tell us what does.'
const FROM_LINK =
  'The shared shortcut installed on one phone and worked. It has not been tried from the installed Home Screen app or on a second phone. The names on these screens come from that file and one phone: tell us what differs.'

/** The steps to get Iberia notifications into the app, and a live check that the first one arrived. */
export function CaptureSetupSetting() {
  const setup = useCaptureSetup()
  return (
    <>
      <SectionTitle>Set up capture</SectionTitle>
      <Card>
        <div className={tabStyles.settingGroup}>
          <p className={tabStyles.settingHint}>
            Capture sends each Iberia card notification from your iPhone to the app, which turns it into a payment for
            you to review. {IOS_NOTE} {setup.status?.shortcutUrl ? FROM_LINK : BY_HAND}
          </p>
          {setup.error ? (
            <p className={tabStyles.settingError} role="alert">
              {setup.error}
            </p>
          ) : null}
          <Steps setup={setup} />
        </div>
      </Card>
    </>
  )
}
