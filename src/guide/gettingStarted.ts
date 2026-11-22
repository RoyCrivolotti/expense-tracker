/**
 * The getting-started guide, written once. The app shows it in a sheet (`ui/guide`) and `docs/GETTING-STARTED.md` is
 * generated from it (`scripts/gen-getting-started.ts`, with a test that fails when the page is out of date), so the two
 * cannot say different things. Plain text only: no markup, names or data of a real person.
 */

export type GuideBlock =
  { kind: 'p'; text: string } | { kind: 'steps'; items: readonly string[] } | { kind: 'list'; items: readonly string[] }

export interface GuideSection {
  id: string
  title: string
  blocks: readonly GuideBlock[]
}

export const GUIDE_SECTIONS: readonly GuideSection[] = [
  {
    id: 'signing-in',
    title: 'Signing in',
    blocks: [
      {
        kind: 'p',
        text: 'You sign in with your Google account. The first time, the app does not know you yet and shows a Request access button.',
      },
      {
        kind: 'p',
        text: 'Tap it and wait. The owner approves requests inside the app, and the screen says your request is waiting until then. Tap Refresh status to check, or open the app again later.',
      },
    ],
  },
  {
    id: 'setting-up',
    title: 'Setting up',
    blocks: [
      {
        kind: 'p',
        text: 'A short setup opens the first time. It has three screens, and everything in it can be changed later in Settings.',
      },
      {
        kind: 'steps',
        items: [
          'Welcome. Choose your currency and the day your month starts. Leave 1 for calendar months, or pick your payday if you budget from one pay to the next.',
          'What do you spend on? Pick a starter list of categories, each with a monthly limit. Untick what you do not need. You can change the limits at any time.',
          'Where do you pay from? Name the account you pay from. If you also pay with a credit card that is charged once a month, tick the box for it.',
        ],
      },
      {
        kind: 'p',
        text: 'The first time, Finish setup applies your choices straight away. To go through setup again, open Settings, then Setup, then Run setup again; it then lists what it will change before it does.',
      },
    ],
  },
  {
    id: 'first-month',
    title: 'Your first month',
    blocks: [
      {
        kind: 'p',
        text: 'Add a transaction with the + button. An amount, a description and a category are enough; a receipt, a note, a flag, labels and a payment plan can wait. Use the same name for the same shop each time: it is what suggestions and Analytics group transactions by.',
      },
      { kind: 'p', text: 'There are five types:' },
      {
        kind: 'list',
        items: [
          'Expense: money you spend.',
          'Income: money you receive, such as a salary.',
          'Invest: money you put into your investments. It counts as invested, not as spending.',
          'Withdraw: money taken out of your investments and into your account.',
          'Refund: money paid back for something you bought. It comes off the spending of its category.',
        ],
      },
      {
        kind: 'p',
        text: 'Every payment counts in a budget month, which is usually the month of its date. If your month starts on day 13, a payment dated the 13th or later counts in the next month. The form shows the budget month next to the date, and you can change it.',
      },
      {
        kind: 'p',
        text: 'The Dashboard shows the month you pick at the top: what came in, what went out, how each budget is doing and the latest payments. Use Transactions to find, change or delete payments, and Analytics to see where the money went once there are a few weeks of them.',
      },
    ],
  },
  {
    id: 'older-payments',
    title: 'Bringing in older payments',
    blocks: [
      {
        kind: 'p',
        text: 'If you have payments from before you started, you can bring them in from a file. Set up your categories and accounts first: the file must use their names.',
      },
      {
        kind: 'steps',
        items: [
          'Open Settings, then Data, and press Download template.',
          'Fill the template with your transactions. Use your category and account names exactly as they are in the app. Amounts are whole cents (1250 is 12.50), dates look like 2026-07-01, and the type is one of expense, income, investment or refund. A withdrawal is an investment with a negative amount. The example row in the template shows each of them.',
          'Upload the file in the same place. The app says how many rows are ready and lists the first few it has to skip. Press Confirm import to bring in the rows that are ready.',
        ],
      },
    ],
  },
  {
    id: 'on-your-phone',
    title: 'Putting it on your phone',
    blocks: [
      {
        kind: 'list',
        items: [
          'iPhone or iPad: open the app in Safari, tap Share, then Add to Home Screen.',
          'Android: open the browser menu and choose Install app.',
          'A computer: use the install button in the address bar of Chrome or Edge, if it shows one.',
        ],
      },
      { kind: 'p', text: 'If the installed app asks you to sign in again, sign in the same way as in the browser.' },
    ],
  },
  {
    id: 'capture',
    title: 'Capture',
    blocks: [
      {
        kind: 'p',
        text: 'Capture is optional. It passes your bank app’s payment notifications to this app, and each one with an amount shows up on the Dashboard for you to confirm with a tap.',
      },
      {
        kind: 'p',
        text: 'Capture works on an iPhone or iPad that has the Shortcuts app, tested on iOS 27. It is not available on Android or on a computer. Setup takes about ten minutes, once per device: in this app open Settings, then the Capture tab, and follow the steps there. Adding payments by hand works without it.',
      },
    ],
  },
  {
    id: 'goals',
    title: 'Goals',
    blocks: [
      {
        kind: 'p',
        text: 'Goals is a long-range plan. It answers one question: if you invest the same amount every month, what could you have in 10, 20 or 30 years?',
      },
      {
        kind: 'p',
        text: 'To start you only need two numbers: what you have invested so far and what you add each month. Everything else starts at a sensible value you can change later. Nothing is saved until you save the scenario. If you note what your accounts hold each month, the Progress tab shows how you are doing against the plan.',
      },
    ],
  },
]
