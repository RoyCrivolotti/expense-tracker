import type { ReactNode } from 'react'
import { SUPPORTED_SOURCES } from '../../domain/capture/classify'
import { AddShortcutLink } from './AddShortcutStep'
import { BEFORE_ADDRESS, afterAddress } from './manualSteps'
import { Address } from './SetupAddress'
import type { Setup } from './SetupStep'

/** One thing to do, with what to tap or type in bold. */
export interface SetupStepSpec {
  id: string
  title: string
  body: ReactNode
}

const words = SUPPORTED_SOURCES.map((s) => <b key={s}>{s}</b>)
/** "iberia", or "iberia or santander": whatever the server's rules read, so this cannot drift from them. */
const sourceWords = words.flatMap((w, i) => (i === 0 ? [w] : [' or ', w]))

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

const automationStep = (shared: boolean): SetupStepSpec => ({
  id: 'automation',
  title: 'Check the automation is on',
  body: (
    <p>
      {shared ? 'A shared shortcut may arrive with its automation switched off; that is not tried yet. ' : ''}Open the automation and keep{' '}
      <b>Automation</b> on. Turn on <b>Allow Running When Locked</b> (info button, Privacy). Notify was off on the
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

/** With the shortcut's share link available: add it in Shortcuts, then make the three edits it needs by hand. */
export function fileSteps(setup: Setup, shortcutUrl: string): SetupStepSpec[] {
  return [
    keyStep(setup),
    { id: 'add', title: 'Add the shortcut', body: <AddShortcutLink href={shortcutUrl} /> },
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
          after it in front of the key.
        </p>
      ),
    },
    {
      id: 'word',
      title: 'Name your bank',
      body: (
        <p>
          In the JSON, replace <b>CARD_NAME_HERE</b> in the <b>source</b> field with the word for your bank. Today that
          is {sourceWords}.
        </p>
      ),
    },
    automationStep(true),
    purchaseStep(),
  ]
}

/** With no shared shortcut: build it, one action at a time. */
export function manualSteps(setup: Setup): SetupStepSpec[] {
  return [
    keyStep(setup),
    ...BEFORE_ADDRESS,
    {
      id: 'url',
      title: 'Type the address',
      body: (
        <>
          <p>
            In the action, tap <b>URL</b> and type this address. The <b>/capture</b> is part of it:
          </p>
          <Address setup={setup} />
        </>
      ),
    },
    ...afterAddress(sourceWords),
    automationStep(false),
    purchaseStep(),
  ]
}
