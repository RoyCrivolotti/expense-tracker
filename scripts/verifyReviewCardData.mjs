/**
 * Invented payments for looking at the "To review" card in a browser. Nothing here comes from a real bank, merchant
 * or person: the names are placeholders and the bank's sentences are made up for this file.
 * "Today" is Thu 15 Oct 2026, inside the demo data's last month.
 */
export const NOW = '2026-10-15T12:00:00'

const pad = (n) => String(n).padStart(2, '0')
const at = (
  day,
  h = 9,
  m = 41,
) => `2026-10-${pad(day)}T${pad(h)}:${pad(m)}:07+02:00`
const day = (d) => `2026-10-${pad(d)}`
let n = 0
const id = () => `0b0c0d0e-1111-4222-8333-${String(++n).padStart(12, '0')}`

/** What the person's history says of a payment; its amount and type follow the payment's. */
const said = (
  description,
  categoryId,
  over = {},
) => ({
  description,
  categoryId,
  type: 'expense',
  accountId: 1,
  amountCents: 0,
  sightings: 4,
  settled: true,
  reasons: [],
  ...over,
})

/** One payment. `s` is what the person's history says of it. */
function pay(
  cents,
  d,
  h,
  m,
  over = {},
) {
  const { s, ...rest } = over
  const type = rest.suggestedType === undefined ? 'expense' : rest.suggestedType
  const base = {
    id: id(),
    accountId: 1,
    amountCents: cents,
    currency: 'EUR',
    localDate: day(d),
    occurredAt: at(d, h, m),
    createdAt: new Date(Date.UTC(2026, 9, d, h - 2, m, 9)).toISOString(),
    merchantRaw: 'TIENDA EJEMPLO',
    descriptionSuggested: null,
    suggestedType: type,
    card: null,
    possibleMatch: null,
    message: null,
    ...rest,
  }
  // What the server would say of the text: every whole message in this file shows an amount with its currency.
  const named = base.merchantRaw !== null && !/\d EUR\b/.test(base.merchantRaw)
  return { ...base, named, suggestion: s ? { ...s, amountCents: base.amountCents, type: base.suggestedType } : null }
}

const ALERT = (amount) => `Example Bank alert: ${amount} EUR today. Thank you for banking with us`
const CARD = (
  amount,
  shop,
) => `Card used: ${amount} EUR, ${shop}`
const match = (
  transactionId,
  description,
  d,
  amountCents,
  accountId = 1,
) => ({ transactionId, description, date: day(d), amountCents, type: 'expense', accountId })

const coffee = () =>
  pay(340, 15, 8, 14, {
    merchantRaw: 'CAFE EJEMPLO 0042',
    message: CARD('3,40', 'CAFE EJEMPLO 0042'),
    s: said('Coffee', 2),
  })
const unnamed = () =>
  pay(4380, 15, 3, 50, {
    merchantRaw: ALERT('43,80'),
    message: ALERT('43,80'),
    s: said(null, null, { sightings: 0, settled: false }),
  })
const gym = () =>
  pay(3990, 14, 7, 2, {
    merchantRaw: 'CLUB DEPORTIVO EJEMPLO',
    message: 'Taken today: 39,90 EUR for CLUB DEPORTIVO EJEMPLO',
    s: said('Gym', 6, { sightings: 1, settled: false }),
  })
const utility = () =>
  pay(6215, 13, 8, 10, {
    merchantRaw: 'EXAMPLE UTILITY SAU',
    message: 'Taken today: 62,15 EUR for EXAMPLE UTILITY SAU',
    s: said('Example Utility', 4, { sightings: 1, settled: false }),
  })
const utilityNotice = () =>
  pay(6215, 13, 10, 2, {
    occurredAt: at(9, 10, 2),
    createdAt: '2026-10-09T08:02:09.000Z',
    merchantRaw: 'Heads up: 62,15 EUR for EXAMPLE UTILITY is due on 13/10',
    message: 'Heads up: 62,15 EUR for EXAMPLE UTILITY is due on 13/10. Thank you for banking with us',
    s: said(null, null, { sightings: 0, settled: false, reasons: ['new-shape'] }),
  })
const market = () =>
  pay(2399, 12, 12, 31, {
    merchantRaw: 'MERCADO EJEMPLO',
    message: CARD('23,99', 'MERCADO EJEMPLO'),
    s: said('Groceries', 1),
    possibleMatch: match(900, 'Groceries, market', 12, 2399),
  })
const salary = () =>
  pay(185000, 10, 8, 2, {
    suggestedType: 'income',
    merchantRaw: 'EMPRESA EJEMPLO SL',
    message: 'Good news: 1.850,00 EUR arrived from EMPRESA EJEMPLO SL',
    s: said('Salary', 1, { reasons: ['new-shape'] }),
  })
const parking = () =>
  pay(1500, 1, 9, 40, {
    accountId: null,
    card: { source: 'bank', digits: '0000' },
    merchantRaw: 'PARKING EJEMPLO',
    s: said('Parking', 3, { accountId: null }),
  })
const dollars = () =>
  pay(1820, 7, 16, 44, { currency: 'USD', merchantRaw: 'ONLINE SHOP EXAMPLE', s: said('Online shop', 5) })

const SEVEN = () => [coffee(), unnamed(), gym(), utility(), utilityNotice(), market(), salary()]

const more = () => [
  pay(210, 9, 9, 5, { merchantRaw: 'PANADERIA EJEMPLO', s: said('Bakery', 1) }),
  pay(1820, 8, 21, 40, { merchantRaw: ALERT('18,20'), s: said(null, null, { sightings: 0, settled: false }) }),
  pay(5400, 8, 18, 12, { merchantRaw: 'GASOLINERA EJEMPLO', s: said('Fuel', 3) }),
  dollars(),
  pay(30000, 6, 11, 0, { suggestedType: null, merchantRaw: 'Moved by you: 300,00 EUR to your savings pot' }),
  pay(1299, 5, 6, 0, { merchantRaw: 'STREAMING EJEMPLO', s: said('Streaming', 5) }),
  pay(4250, 4, 13, 20, { merchantRaw: 'FARMACIA EJEMPLO', s: said('Pharmacy', 6, { settled: false }) }),
  pay(2500, 3, 10, 31, { suggestedType: 'refund', merchantRaw: 'ZAPATERIA EJEMPLO', s: said('Shoe shop', 5) }),
  pay(890, 2, 8, 50, { merchantRaw: 'KIOSCO EJEMPLO', s: said('Kiosk', null) }),
  pay(7800, 2, 22, 15, { merchantRaw: 'RESTAURANTE EJEMPLO', s: said('Restaurant', 2) }),
  parking(),
  pay(990, 1, 17, 5, { merchantRaw: 'LIBRERIA EJEMPLO', s: said('Bookshop', 5) }),
  pay(3650, 1, 7, 30, { merchantRaw: 'TAXI EJEMPLO', s: said('Taxi', 3) }),
]

const LONG = () => [
  pay(6480, 15, 11, 2, {
    merchantRaw: 'SUPERMERCADOS EJEMPLO DEL BARRIO DE LA ESTACION CENTRAL',
    s: said('Supermercados Ejemplo del Barrio de la Estación Central', 1, { sightings: 1, settled: false }),
  }),
  pay(8215, 14, 19, 40, {
    merchantRaw: 'MERCADO EJEMPLO',
    s: said('Weekly groceries for the flat, shared account', 1),
  }),
  pay(12345678, 13, 10, 15, {
    suggestedType: 'income',
    merchantRaw: 'NOTARIA EJEMPLO',
    s: said('Flat sale', 1, { reasons: ['new-shape'] }),
  }),
  pay(25000000, 12, 12, 0, { merchantRaw: 'TRANSFERENCIA EJEMPLO', s: said('Flat purchase', 4) }),
  pay(25000000, 11, 12, 0, {
    merchantRaw: 'NOTARIA EJEMPLO Y ASOCIADOS, SOCIEDAD LIMITADA PROFESIONAL',
    s: said('Notaría Ejemplo y Asociados, Sociedad Limitada Profesional', null, { sightings: 1, settled: false }),
  }),
  pay(12345678, 11, 9, 0, {
    suggestedType: 'income',
    merchantRaw: 'INMOBILIARIA EJEMPLO DE LA COSTA, SOCIEDAD ANONIMA',
    s: said('Inmobiliaria Ejemplo de la Costa, Sociedad Anónima', 1, { sightings: 1, settled: false }),
  }),
]

const DUPLICATES = () => [
  pay(1250, 14, 14, 5, {
    merchantRaw: 'BAR EJEMPLO',
    message: CARD('12,50', 'BAR EJEMPLO'),
    s: said('Lunch', 2),
    possibleMatch: match(901, 'Lunch', 14, 1250),
  }),
  pay(6480, 11, 11, 2, {
    merchantRaw: 'SUPERMERCADOS EJEMPLO DEL BARRIO DE LA ESTACION CENTRAL',
    message: CARD('64,80', 'SUPERMERCADOS EJEMPLO DEL BARRIO DE LA ESTACION CENTRAL'),
    s: said('Supermercados Ejemplo del Barrio de la Estación Central', 1),
    possibleMatch: match(902, 'Weekly groceries for the flat, shared account', 10, 6480, 2),
  }),
  coffee(),
]

/** Each a fresh list, so two pages never share ids. */
export const SETS = {
  one: () => [unnamed()],
  three: () => [coffee(), unnamed(), market()],
  seven: SEVEN,
  twenty: () => [...SEVEN(), ...more()],
  long: LONG,
  pair: () => [coffee(), utility(), utilityNotice()],
  duplicates: DUPLICATES,
  asks: () => [parking(), dollars(), coffee()],
}

/** The entry a refused save names, for the review view after "Add". */
export const REFUSAL = {
  error: 'Possible duplicate',
  code: 'possible-duplicate',
  possibleMatch: match(903, 'Coffee, the usual', 15, 340),
}
