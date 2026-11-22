import type { ReactNode } from 'react'
import type { SetupStepSpec } from './setupSteps'

/**
 * Said where the header is set: an empty row under Headers makes Cloudflare refuse the request before the app sees it,
 * so nothing on the app's side can count or report it.
 */
export const NO_EMPTY_HEADER: ReactNode = (
  <>
    Leave no empty row under <b>Headers</b>: an empty header makes the request fail before it reaches the app.
  </>
)

/** The manual steps that come before the address: the trigger, its app, running unasked and the action. */
export const BEFORE_ADDRESS: SetupStepSpec[] = [
  {
    id: 'trigger',
    title: 'Start the automation',
    body: (
      <p>
        Open the <b>Shortcuts</b> app and start a new automation. Choose the trigger{' '}
        <b>When I receive a notification from</b>.
      </p>
    ),
  },
  {
    id: 'app',
    title: 'Choose the bank’s app',
    body: <p>Tap the app name and choose your bank&rsquo;s app. Leave the filters empty.</p>,
  },
  {
    id: 'run',
    title: 'Let it run without asking',
    body: (
      <p>
        On the same screen, choose the option that runs the automation without asking you each time; with the other one,
        every payment waits for you to tap. On iOS 18 the two are called <b>Run Immediately</b> and{' '}
        <b>Run After Confirmation</b>; on your phone they may be worded differently. Then tap <b>Next</b>.
      </p>
    ),
  },
  {
    id: 'action',
    title: 'Add the action',
    body: (
      <p>
        If Shortcuts offers a list of shortcuts, choose <b>New Blank Automation</b>. Tap the <b>Search</b> bar at the
        bottom and type <b>Get Contents of URL</b>. Tap that action to add it.
      </p>
    ),
  },
]

const SETTINGS: SetupStepSpec[] = [
  {
    id: 'method',
    title: 'Set the method',
    body: (
      <p>
        Tap the small arrow on the action to show more. Change <b>Method</b> from GET to <b>POST</b>.
      </p>
    ),
  },
  {
    id: 'header',
    title: 'Add the key',
    body: (
      <p>
        Under <b>Headers</b>, tap <b>Add new header</b>. Set the key to <b>Authorization</b>. Set the text to{' '}
        <b>Bearer</b> (with a space after it) followed by your key. {NO_EMPTY_HEADER}
      </p>
    ),
  },
  {
    id: 'json',
    title: 'Choose JSON',
    body: (
      <p>
        Under <b>Request Body</b>, choose <b>JSON</b>.
      </p>
    ),
  },
]

/** One JSON field taken from the notification: add it as Text, name it, and pick the notification's variable. */
function field(
  key: string,
  variable: string,
  more?: ReactNode,
): SetupStepSpec {
  return {
    id: `field-${key}`,
    title: `Add the ${key} field`,
    body: (
      <p>
        Tap <b>Add new field</b>, choose <b>Text</b>, set the key to <b>{key}</b>. Tap the value field, choose the
        notification&rsquo;s variable, then pick <b>{variable}</b>.{more ? <> {more}</> : null}
      </p>
    ),
  }
}

/** Said where the source would once have been typed, so a person with an older shortcut leaves it alone. */
export const OLDER_SOURCE: ReactNode = (
  <>
    An older shortcut that sends a <b>source</b> name instead keeps working: leave it.
  </>
)

const FIELDS: SetupStepSpec[] = [
  field(
    'app',
    'App',
    <>
      The app files your payments and cards under the bank app&rsquo;s name, so there is nothing to type. {OLDER_SOURCE}
    </>,
  ),
  field('title', 'Title'),
  field('body', 'Body'),
  field('date', 'Date', 'Tap the variable once more and look for a date format called ISO 8601.'),
]

const SAVE: SetupStepSpec = {
  id: 'save',
  title: 'Save it',
  body: (
    <p>
      Save the automation. Optional: add an If that checks the answer contains ok, and otherwise shows a notification,
      Capture failed.
    </p>
  ),
}

/** The manual steps after the address. */
export function afterAddress(): SetupStepSpec[] {
  return [...SETTINGS, ...FIELDS, SAVE]
}
