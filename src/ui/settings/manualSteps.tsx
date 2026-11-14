import type { ReactNode } from 'react'
import type { SetupStepSpec } from './setupSteps'

/** The manual steps that come before the address: the trigger, its app and the action. */
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
    body: (
      <p>
        Tap the app name and choose your bank&rsquo;s app (<b>IberiaCards</b> for the Icon card). Leave the filters
        empty.
      </p>
    ),
  },
  {
    id: 'action',
    title: 'Add the action',
    body: (
      <p>
        Tap the <b>Search</b> bar at the bottom and type <b>Get Contents of URL</b>. Tap that action to add it.
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
        <b>Bearer</b> (with a space after it) followed by your key.
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
function field(key: string, variable: string, more?: string): SetupStepSpec {
  return {
    id: `field-${key}`,
    title: `Add the ${key} field`,
    body: (
      <p>
        Tap <b>Add new field</b>, choose <b>Text</b>, set the key to <b>{key}</b>. Tap the value field, choose the
        notification&rsquo;s variable, then pick <b>{variable}</b>.{more ? ` ${more}` : ''}
      </p>
    ),
  }
}

const FIELDS: SetupStepSpec[] = [
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

/** The manual steps after the address. `sourceWords` is the word for the bank, from the server's own rules. */
export function afterAddress(sourceWords: ReactNode): SetupStepSpec[] {
  const source: SetupStepSpec = {
    id: 'source',
    title: 'Add the source field',
    body: (
      <p>
        Tap <b>Add new field</b>, choose <b>Text</b>, set the key to <b>source</b> and type the word for your bank:{' '}
        {sourceWords}.
      </p>
    ),
  }
  return [...SETTINGS, source, ...FIELDS, SAVE]
}
