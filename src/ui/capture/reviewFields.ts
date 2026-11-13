import type { NewTransaction } from '../../data/dataSource'
import type { RecommendationInfo } from '../../data/recommendationsApi'
import { cleanText } from '../../domain/capture/text'
import { merchantHistory, nearMonthEdge, reviewReasons, type MerchantIndex, type ReviewReason } from '../../domain/capture/review'
import type { TxnType } from '../../types'
import type { TransactionSeed } from '../actions'
import { suggestBudgetMonth } from '../components/transactionFormState'
import { monthEdgeNotice } from './reviewNotice'
import type { ExpenseModel } from '../useExpenseData'

/** The seven things a payment becomes, worked out from the push and the person's own history. Never stored. */
export interface ReviewView {
  rec: RecommendationInfo
  type: TxnType | null
  amountCents: number | null
  /** The merchant as the person last typed it, else the bank's text cleaned, else empty. */
  description: string
  /** True when the description is how the person typed this merchant before, not the bank's text. */
  fromHistory: boolean
  categoryId: number | null
  categoryName: string | null
  accountId: number | null
  accountName: string | null
  date: string
  /** `HH:MM` in this device's clock, or null when the push time is unreadable. */
  time: string | null
  budgetMonth: string
  reasons: ReviewReason[]
  /** True only when nothing is in doubt, so one tap may add it. */
  oneTap: boolean
}

const pad = (n: number) => String(n).padStart(2, '0')
const dayOf = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`

/** The push's hour when this device's day is the payment's day, else null (a traveller's phone and this device differ). */
function hourOf(rec: RecommendationInfo): { hour: number | null; time: string | null } {
  const at = new Date(rec.occurredAt)
  if (Number.isNaN(at.getTime())) return { hour: null, time: null }
  const time = `${pad(at.getHours())}:${pad(at.getMinutes())}`
  return { hour: dayOf(at) === rec.localDate ? at.getHours() : null, time }
}

function arrivedMonth(rec: RecommendationInfo): string {
  const at = new Date(rec.createdAt)
  return Number.isNaN(at.getTime()) ? '' : dayOf(at).slice(0, 7)
}

/** The category and account the person's own history and settings give a payment, each null unless still in use. */
function knownReferences(rec: RecommendationInfo, categoryIdFromHistory: number | null, model: ExpenseModel) {
  const category = categoryIdFromHistory === null ? undefined : model.lookup.category(categoryIdFromHistory)
  const account = rec.accountId === null ? undefined : model.lookup.account(rec.accountId)
  return {
    categoryId: category?.active ? category.id : null,
    categoryName: category?.active ? category.name : null,
    accountId: account ? account.id : null,
    accountName: account?.name ?? null,
  }
}

/** Works out what a recommendation would become and whether one tap may add it. */
export function describeRecommendation(rec: RecommendationInfo, model: ExpenseModel, merchants: MerchantIndex): ReviewView {
  const bankText = rec.merchantRaw === null ? null : cleanText(rec.merchantRaw)
  const history = merchantHistory(merchants, bankText)
  const refs = knownReferences(rec, history.categoryId, model)
  const { hour, time } = hourOf(rec)
  const reasons = reviewReasons({
    amountCents: rec.amountCents,
    currency: rec.currency,
    hasMerchant: !!bankText,
    categoryId: refs.categoryId,
    accountId: refs.accountId,
    suggestedType: rec.suggestedType,
    sightings: history.sightings,
    monthEdge: nearMonthEdge({ localDate: rec.localDate, hour, arrivedMonth: arrivedMonth(rec) }),
    possibleMatch: rec.possibleMatch != null,
  })
  return {
    rec,
    type: rec.suggestedType,
    amountCents: rec.amountCents,
    description: history.label ?? bankText ?? '',
    fromHistory: history.label !== null,
    ...refs,
    date: rec.localDate,
    time,
    budgetMonth: suggestBudgetMonth(model, rec.localDate),
    reasons,
    oneTap: reasons.length === 0,
  }
}

const noticeOf = (view: ReviewView) => {
  const notice = monthEdgeNotice(view)
  return notice ? { notice } : {}
}

/** What the add form opens with. Nothing the push could not say is filled in, and the form shows the rest. */
export function seedOf(view: ReviewView): TransactionSeed {
  const foreign = view.reasons.includes('foreign')
  return {
    recommendationId: view.rec.id,
    date: view.date,
    budgetMonth: view.budgetMonth,
    // Cents in another currency are not euros: the person types what the bank charged.
    ...(view.amountCents !== null && !foreign ? { amountCents: view.amountCents } : {}),
    ...(view.type ? { type: view.type } : {}),
    // A description only from the person's own history: an empty one beats a wrong one.
    ...(view.fromHistory ? { description: view.description } : {}),
    ...(view.accountId !== null ? { accountId: view.accountId } : {}),
    ...(view.categoryId !== null ? { categoryId: view.categoryId } : {}),
    ...noticeOf(view),
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
