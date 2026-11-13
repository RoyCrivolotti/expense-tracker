import type { NewTransaction } from '../../data/dataSource'
import type { RecommendationInfo } from '../../data/recommendationsApi'
import { cleanText } from '../../domain/capture/text'
import { bankMerchantName, merchantHistory, otherBudgetDays, paymentClock, reviewReasons, type MerchantIndex, type PaymentClock, type ReviewReason } from '../../domain/capture/review'
import type { TxnType } from '../../types'
import type { SeedCard, TransactionSeed } from '../actions'
import { suggestBudgetMonth } from '../components/transactionFormState'
import { monthEdgeNotice } from './reviewNotice'
import type { ExpenseModel } from '../useExpenseData'

/** The seven things a payment becomes, worked out from the push and the person's own history. Never stored. */
export interface ReviewView {
  rec: RecommendationInfo
  /** The card to ask about: the push showed one and it is not linked to an account that exists. */
  askCard: { source: 'iberia' | 'santander'; digits: string } | null
  type: TxnType | null
  amountCents: number | null
  /** The merchant as the person last typed it, else the bank's text cleaned, else empty. */
  description: string
  /** True when the description is how the person typed this merchant before, not the bank's own text. */
  fromHistory: boolean
  categoryId: number | null
  categoryName: string | null
  accountId: number | null
  accountName: string | null
  date: string
  /** `HH:MM` on the phone's clock, or null when the phone's offset is unknown. */
  time: string | null
  budgetMonth: string
  /** The phone's own clock for the payment and its push. */
  clock: PaymentClock
  /** Days the bank might book it on that would be another budget month. Empty unless near an edge. */
  edgeDays: string[]
  reasons: ReviewReason[]
  /** True only when nothing is in doubt, so one tap may add it. */
  oneTap: boolean
}

/** The category and account the person's own history and settings give a payment, each null unless still in use. */
function knownReferences(rec: RecommendationInfo, categoryIdFromHistory: number | null, model: ExpenseModel) {
  const category = categoryIdFromHistory === null ? undefined : model.lookup.category(categoryIdFromHistory)
  const account = rec.accountId === null ? undefined : model.lookup.account(rec.accountId)
  return {
    categoryId: category?.active ? category.id : null,
    categoryName: category?.active ? category.name : null,
    accountId: account?.active ? account.id : null,
    accountName: account?.active ? account.name : null,
  }
}

/** Works out what a recommendation would become and whether one tap may add it. */
export function describeRecommendation(rec: RecommendationInfo, model: ExpenseModel, merchants: MerchantIndex): ReviewView {
  const bankText = rec.merchantRaw === null ? null : cleanText(rec.merchantRaw)
  const history = merchantHistory(merchants, bankText)
  const refs = knownReferences(rec, history.categoryId, model)
  const clock = paymentClock(rec.occurredAt, rec.localDate, rec.createdAt)
  const monthOf = (day: string) => suggestBudgetMonth(model, day)
  const edgeDays = otherBudgetDays(monthOf, rec.localDate, clock.minuteOfDay, clock.arrivedDate)
  const reasons = reviewReasons({
    amountCents: rec.amountCents,
    currency: rec.currency,
    hasMerchant: !!bankText,
    categoryId: refs.categoryId,
    accountId: refs.accountId,
    suggestedType: rec.suggestedType,
    sightings: history.sightings,
    monthEdge: edgeDays.length > 0,
    possibleMatch: rec.possibleMatch != null,
  })
  return {
    rec,
    askCard: refs.accountId === null && rec.card ? rec.card : null,
    type: rec.suggestedType,
    amountCents: rec.amountCents,
    description: history.label ?? (bankText ? bankMerchantName(bankText) : ''),
    fromHistory: history.label !== null,
    ...refs,
    date: rec.localDate,
    time: clock.time,
    budgetMonth: monthOf(rec.localDate),
    clock,
    edgeDays,
    reasons,
    oneTap: reasons.length === 0,
  }
}

const noticeOf = (view: ReviewView) => {
  const notice = monthEdgeNotice(view)
  return notice ? { notice } : {}
}

/** What the add form opens with. Nothing the push could not say is filled in, and the form shows the rest. */
export function seedOf(view: ReviewView, remember?: SeedCard['remember']): TransactionSeed {
  const foreign = view.reasons.includes('foreign')
  return {
    recommendationId: view.rec.id,
    date: view.date,
    budgetMonth: view.budgetMonth,
    // Cents in another currency are not euros: the person types what the bank charged.
    ...(view.amountCents !== null && !foreign ? { amountCents: view.amountCents } : {}),
    ...(view.type ? { type: view.type } : {}),
    // How the person typed this merchant before, else the bank's own text without its store number.
    ...(view.description ? { description: view.description } : {}),
    ...(view.accountId !== null ? { accountId: view.accountId } : {}),
    ...(view.categoryId !== null ? { categoryId: view.categoryId } : {}),
    ...noticeOf(view),
    ...(view.askCard && remember ? { card: { ...view.askCard, answer: { accountId: null, remember: true }, unanswered: `Choose the account for the card ending ${view.askCard.digits} first`, remember } } : {}),
  }
}

/** The transaction one tap adds. Null unless one tap is allowed, so a caller cannot add a payment in doubt. */
export function transactionOf(view: ReviewView): NewTransaction | null {
  const { type, amountCents, accountId, categoryId } = view
  if (!view.oneTap || type === null || type === 'investment' || amountCents === null || accountId === null || categoryId === null) return null
  return {
    date: view.date,
    budgetMonth: view.budgetMonth,
    description: view.description,
    accountId,
    categoryId,
    type,
    amountCents,
    cancelled: false,
    flagId: null,
  }
}
