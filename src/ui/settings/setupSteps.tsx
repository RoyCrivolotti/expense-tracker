import type { ReactNode } from 'react'
import { AddShortcutLink } from './AddShortcutStep'
import { BEFORE_ADDRESS, NO_EMPTY_HEADER, OLDER_SOURCE, afterAddress } from './manualSteps'
import { Address } from './SetupAddress'
import type { Setup } from './SetupStep'

/** One thing to do, with what to tap or type in bold. */
export interface SetupStepSpec {
  id: string
  title: string
  body: ReactNode
}

const keyStep = (setup: Setup): SetupStepSpec => ({
  id: 'key',
  title: `Make a key and copy it${setup.keys && setup.keys.length > 0 ? ' (a key already exists)' : ''}`,
  body: (
    <p>
      In <b>Capture key</b> below, type a name for your phone and tap <b>Make a key</b>. Tap <b>Copy</b> at once: the
      key is shown once.
    </p>
  ),
})

/** Said in the shared list, which has no step of its own for it: the shortcut arrives with the choice already made. */
const RUNS_UNASKED: ReactNode = (
  <>
    set to run without asking you each time (on iOS 18 that option is called <b>Run Immediately</b>; on your phone it
    may be worded differently)
  </>
)

const automationStep = (shared: boolean): SetupStepSpec => ({
  id: 'automation',
  title: 'Check the automation is on',
  body: (
    <p>
      {shared ? 'A shared shortcut may arrive with its automation switched off; that is not tried yet. ' : ''}Open the automation and keep{' '}
      <b>Automation</b> on, {shared ? RUNS_UNASKED : 'still set to run without asking, as you chose when you made it'}. Turn on <b>Allow Running When Locked</b> (info button, Privacy). Notify was off on the
      automations that were tried, and whether it matters is not tried yet. The editor can say Automation is turned off while
      it runs, so trust the automation list and your first real payment.
    </p>
  ),
})

const purchaseStep = (): SetupStepSpec => ({
  id: 'purchase',
  title: 'Make one purchase and watch the line below',
  body: (
    <p>
      Pay with your card; a small amount will do. If iOS asks whether the shortcut may send data, allow it and choose
      the option that remembers the answer. If it asks again on every payment, an unattended run cannot work yet. That
      is untested, so tell us.
    </p>
  ),
})

/** With the shortcut's share link available: add it in Shortcuts, then make the edits it needs by hand. */
export function fileSteps(setup: Setup, shortcutUrl: string, onByHand: () => void): SetupStepSpec[] {
  return [
    keyStep(setup),
    { id: 'add', title: 'Add the shortcut', body: <AddShortcutLink href={shortcutUrl} onByHand={onByHand} /> },
    {
      id: 'app',
      title: 'Choose your bank’s app',
      body: (
        <p>
          In the shortcut, tap the app name in the trigger <b>When I receive a notification from</b> and choose your
          bank&rsquo;s app.
        </p>
      ),
    },
    {
      id: 'paste',
      title: 'Paste your key',
      body: (
        <p>
          In the header <b>Authorization</b>, replace <b>KEY_HERE</b> with your key. Keep <b>Bearer</b> and the space
          after it in front of the key. {NO_EMPTY_HEADER}
        </p>
      ),
    },
    {
      id: 'app-field',
      title: 'Check the app field',
      body: (
        <p>
          In the JSON, the <b>app</b> field holds the notification&rsquo;s <b>App</b> variable, so the bank app&rsquo;s
          name is sent for you. If your copy has a <b>source</b> field with <b>CARD_NAME_HERE</b> instead, delete it,
          tap <b>Add new field</b>, choose <b>Text</b>, set the key to <b>app</b> and pick the notification&rsquo;s{' '}
          <b>App</b> variable. {OLDER_SOURCE}
        </p>
      ),
    },
    automationStep(true),
    purchaseStep(),
  ]
}

/** With no shared shortcut, or when adding it did not work: build it, one action at a time. */
export function manualSteps(setup: Setup): SetupStepSpec[] {
  return [
    keyStep(setup),
    ...BEFORE_ADDRESS,
    {
      id: 'url',
      title: 'Enter the address',
      body: (
        <>
          <p>
            Tap <b>Copy</b> here, then in the action tap <b>URL</b> and paste. The <b>/capture</b> at the end is part of
            the address:
          </p>
          <Address setup={setup} />
        </>
      ),
    },
    ...afterAddress(),
    automationStep(false),
    purchaseStep(),
  ]
}
