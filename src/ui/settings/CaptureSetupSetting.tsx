import { useEffect, useId, useRef, useState, type Ref } from 'react'
import { devicePlatform, isAppleTouch } from '../../config/device'
import { Card, SectionTitle } from '../components/primitives'
import { useAccountOwner } from '../hooks/accountOwner'
import tabStyles from '../tabs/tabs.module.css'
import { Waiting } from './CaptureSetupCheck'
import styles from './CaptureSetupSetting.module.css'
import { Step, type Setup } from './SetupStep'
import { fileSteps, manualSteps } from './setupSteps'
import { CaptureIntro } from './CaptureIntro'
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
  'Capture reads your bank app\u2019s notifications through a Shortcut on your iPhone or iPad. It does not exist on Android or on a computer. Set it up from Settings on that iPhone or iPad; what it captures shows here as well.'
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
  const owner = useAccountOwner()
  const platform = devicePlatform()
  if (!isAppleTouch(platform) && platform !== 'unknown') {
    return (
      <>
        <SectionTitle>Set up capture</SectionTitle>
        <Card>
          <p className={tabStyles.settingHint}>{ELSEWHERE}</p>
        </Card>
      </>
    )
  }
  // Keyed by person, so the ticks are read again when someone else signs in without the page reloading.
  return <SetupOnThisDevice key={owner ?? ''} />
}

/** Where capture can run: the card that says what it is, then the steps. The setup is read here, once, for both. */
function SetupOnThisDevice() {
  const setup = useCaptureSetup()
  const toggle = useRef<HTMLButtonElement>(null)
  // Opens the steps if they were closed and takes the focus to their toggle. The browser scrolls it into view clear of the
  // sticky tab bar, which the page's scroll padding allows for.
  const startSetup = () => {
    setup.showSteps(true)
    toggle.current?.focus()
  }
  // Until the status has been read nobody knows which way the setup goes, and drawing its heading and box first would
  // push them down when the card above folds in.
  if (setup.status === null && setup.error === null) return null
  return (
    <>
      <CaptureIntro setup={setup} onStart={startSetup} />
      <SectionTitle>Set up capture</SectionTitle>
      <Card>
        <SetupSteps setup={setup} toggle={toggle} />
      </Card>
    </>
  )
}

function tickedText(count: number, ticked: number): string {
  return `${count} steps, ${ticked === 0 ? 'none ticked' : ticked === count ? 'all ticked' : `${ticked} ticked`}`
}

/**
 * Which steps show, and the way between the two lists. The manual steps are also the way out when adding the shared
 * shortcut did not work, so with a link the person can swap to them and back.
 */
function useSteps(setup: Setup) {
  const shortcutUrl = shortcutLink(setup)
  const byHand = shortcutUrl === null || setup.byHand
  const group = useRef<HTMLDivElement>(null)
  const [switches, setSwitches] = useState(0)
  const switchTo = (on: boolean) => {
    setSwitches((n) => n + 1)
    setup.setByHand(on)
  }
  // The button that was tapped leaves with its list, so the focus goes to the one that takes it back.
  useEffect(() => {
    if (switches > 0) group.current?.querySelector<HTMLElement>('[data-setup-switch]')?.focus()
  }, [switches])
  const steps = shortcutUrl && !byHand ? fileSteps(setup, shortcutUrl, () => switchTo(true)) : manualSteps(setup)
  return { group, steps, byHand, back: shortcutUrl && byHand ? () => switchTo(false) : null }
}

/** The numbered steps behind the row that opens and closes them. */
function StepsFold({ setup, steps, byHand, back, toggle }: { setup: Setup; toggle: Ref<HTMLButtonElement> } & Omit<ReturnType<typeof useSteps>, 'group'>) {
  const foldId = useId()
  const open = setup.stepsOpen
  return (
    <div>
      <button ref={toggle} type="button" className={styles.toggle} aria-expanded={open} aria-controls={foldId} onClick={() => setup.showSteps(!open)}>
        <span>{open ? 'Hide the steps' : 'Show the steps'}</span>
        <span className={styles.toggleCount}>{tickedText(steps.length, steps.filter((s) => setup.ticks.has(s.id)).length)}</span>
      </button>
      {/* Kept in the DOM so it can fold; `inert` keeps touch, focus and screen readers out of what is out of sight. */}
      <div id={foldId} className={open ? styles.fold : `${styles.fold} ${styles.folded}`} inert={!open}>
        <div className={styles.foldInner}>
          <p className={tabStyles.settingHint}>{REQUIREMENT}</p>
          <p className={tabStyles.settingHint}>{byHand ? BY_HAND : FROM_LINK}</p>
          {back ? (
            <div className={styles.switch}>
              <p className={tabStyles.settingHint}>
                These steps build the shortcut yourself, in place of adding the shared one. What you ticked is kept.
              </p>
              <button type="button" className={styles.copy} data-setup-switch onClick={back}>
                Back to the shared shortcut
              </button>
            </div>
          ) : null}
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
  )
}

function SetupSteps({ setup, toggle }: { setup: Setup; toggle: Ref<HTMLButtonElement> }) {
  const { group, ...fold } = useSteps(setup)
  return (
    <div ref={group} className={tabStyles.settingGroup}>
      <p className={tabStyles.settingHint}>
        Each notification that shows an amount with its currency becomes a payment for you to review; the rest are only counted.
      </p>
      {setup.error ? (
        <p className={tabStyles.settingError} role="alert">
          {setup.error}
        </p>
      ) : null}
      <StepsFold setup={setup} toggle={toggle} {...fold} />
      <Waiting setup={setup} />
    </div>
  )
}
