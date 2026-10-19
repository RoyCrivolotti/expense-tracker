/**
 * A backup turned back into rows: the INSERT statements that rebuild one owner's ledger in a database that has
 * the schema and none of their data. It only writes text. Nothing here connects to a database; a person looks
 * at the statements and applies them (docs/DEPLOYMENT.md, "Restoring from a backup").
 *
 * Rows are inserted with the ids they had, in the order of `EXPORT_TABLES`, so every reference points at a row
 * that is already there. The dataset holds everything the app reads, which is not every column: timestamps the
 * app never shows (when a label or a scenario was created) start again, and a receipt's bytes are in R2 and not in
 * a backup, so each restored attachment row gets a key that names nothing (see {@link placeholderKey}).
 */
import { EXPORT_TABLES, type ExportTable } from '../domain/data/exportTables'
import type { ExpenseDataset } from '../domain/types'
import { descriptionNorm } from './descriptionNorm'

export type BackupTables = Record<ExportTable, object[]>

type Value = string | number | null
type Row = Record<string, unknown>

export function emptyTables(): BackupTables {
  return Object.fromEntries(EXPORT_TABLES.map((table) => [table, []])) as unknown as BackupTables
}

/** The tables of a single-file snapshot, which is a whole `ExpenseDataset`. */
export function tablesOfDataset(dataset: ExpenseDataset): BackupTables {
  const tables = emptyTables()
  for (const table of EXPORT_TABLES) {
    tables[table] = table === 'settings' ? [dataset.settings] : [...(dataset[table] as object[])]
  }
  return tables
}

/** SQL text for a value. Strings are quoted with their quotes doubled; nothing is ever spliced in unquoted. */
export function literal(value: Value): string {
  if (value === null) return 'NULL'
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error(`Cannot restore the number ${String(value)}`)
    return String(value)
  }
  if (value.includes('\u0000')) throw new Error('Cannot restore text that holds a NUL character')
  return `'${value.replaceAll("'", "''")}'`
}

function insert(table: string, row: Record<string, Value>): string {
  const columns = Object.keys(row)
  return `INSERT INTO ${table} (${columns.join(', ')}) VALUES (${columns.map((c) => literal(row[c] as Value)).join(', ')})`
}

const bit = (flag: unknown): number => (flag ? 1 : 0)
const orNull = (value: unknown): Value => (value === undefined || value === null ? null : (value as Value))
const json = (value: unknown): string => JSON.stringify(value ?? [])

/**
 * An attachment row needs a key to a stored receipt, and a backup does not have one (the bytes are not in it, and
 * the dataset does not carry the key). The key names nothing in the bucket: the row says a receipt existed, and the
 * viewer finds no file behind it.
 */
export function placeholderKey(owner: string, id: unknown, thumb = false): string {
  return `restored/${owner}/${String(id)}${thumb ? '_thumb' : ''}`
}

type Mapper = (owner: string, r: Row) => string[]

const MAPPERS: Record<ExportTable, Mapper> = {
  categories: (owner, r) => [
    insert('categories', {
      id: r.id as number, owner, name: r.name as string, monthly_budget_cents: r.monthlyBudgetCents as number,
      sort_order: r.sortOrder as number, icon: orNull(r.icon), color: orNull(r.color), active: bit(r.active),
    }),
  ],
  accounts: (owner, r) => [
    insert('accounts', {
      id: r.id as number, owner, name: r.name as string, kind: r.kind as string,
      settlement: r.settlement as string, active: bit(r.active),
    }),
  ],
  labels: (owner, r) => [
    insert('labels', {
      id: r.id as number, owner, name: r.name as string, color: r.color as string,
      description: orNull(r.description), sort_order: r.sortOrder as number, active: bit(r.active),
    }),
  ],
  flags: (owner, r) => [
    insert('flags', {
      id: r.id as number, owner, name: r.name as string, color: r.color as string,
      description: orNull(r.description), reimbursable: bit(r.reimbursable), sort_order: r.sortOrder as number,
      active: bit(r.active), auto_label_id: orNull(r.autoLabelId),
    }),
  ],
  accountStatements: (owner, r) => [
    insert('account_statements', {
      owner, account_id: r.accountId as number, year_month: r.yearMonth as string,
      paid: bit(r.paid), paid_on: orNull(r.paidOn),
    }),
  ],
  cashActuals: (owner, r) => [
    insert('cash_actuals', { owner, year_month: r.yearMonth as string, actual_cash_cents: r.actualCashCents as number }),
  ],
  settings: (owner, r) => [
    insert('settings', {
      owner, opening_cash_cents: r.openingCashCents as number, opening_investment_cents: r.openingInvestmentCents as number,
      default_account_id: orNull(r.defaultAccountId), investment_category_id: orNull(r.investmentCategoryId),
      currency_code: orNull(r.currencyCode), number_locale: orNull(r.numberLocale),
      budget_rollover_day: orNull(r.budgetRolloverDay), milestones: json(r.milestones),
      claimant_name: orNull(r.claimantName), cash_reserve_months: orNull(r.cashReserveMonths),
      assumed_inflation: orNull(r.assumedInflation), market_volatility: orNull(r.marketVolatility),
      goal_levers: r.goalLevers == null ? null : JSON.stringify(r.goalLevers),
    }),
  ],
  goalScenarios: (owner, r) => [
    insert('goal_scenarios', {
      id: r.id as number, owner, name: r.name as string, color: r.color as string, sort_order: r.sortOrder as number,
      start_invested_cents: r.startInvestedCents as number, monthly_contribution_cents: r.monthlyContributionCents as number,
      expected_real_return: r.expectedRealReturn as number, horizon_years: r.horizonYears as number,
      house_price_cents: r.housePriceCents as number, down_payment_fraction: r.downPaymentFraction as number,
      house_purchase_year: orNull(r.housePurchaseYear), transaction_costs_cents: r.transactionCostsCents as number,
      mortgage_term_years: r.mortgageTermYears as number, mortgage_rate_annual: r.mortgageRateAnnual as number,
      house_appreciation_rate: r.houseAppreciationRate as number, rent_monthly_cents: r.rentMonthlyCents as number,
      annual_spend_cents: r.annualSpendCents as number, safe_withdrawal_rate: r.safeWithdrawalRate as number,
      plan_start_date: orNull(r.planStartDate), life_events: json(r.lifeEvents),
      contribution_schedule: json(r.contributionSchedule), home_carry_rate: r.homeCarryRate as number,
      retirement_years: r.retirementYears as number, is_active: bit(r.isActive),
    }),
  ],
  installmentPlans: (owner, r) => [
    insert('installment_plans', {
      id: r.id as number, owner, description: r.description as string, total_count: r.totalCount as number,
      amount_cents: r.amountCents as number, account_id: r.accountId as number, category_id: r.categoryId as number,
      type: r.type as string, anchor_budget_month: r.anchorBudgetMonth as string,
      start_installment_index: r.startInstallmentIndex as number, due_day_of_month: orNull(r.dueDayOfMonth),
      active: bit(r.active),
    }),
  ],
  wealthAccounts: (owner, r) => [
    insert('wealth_accounts', {
      id: r.id as number, owner, name: r.name as string, kind: r.kind as string,
      sort_order: r.sortOrder as number, archived: bit(r.archived),
    }),
  ],
  wealthCheckins: (owner, r) => [
    insert('wealth_checkins', {
      id: r.id as number, owner, checkin_date: r.checkinDate as string, note: orNull(r.note), created_at: orNull(r.createdAt),
    }),
    ...((r.entries as Row[] | undefined) ?? []).map((e) =>
      insert('wealth_checkin_entries', {
        checkin_id: r.id as number, account_id: e.accountId as number, value_cents: e.valueCents as number,
      }),
    ),
  ],
  transactions: (owner, r) => [
    insert('transactions', {
      id: r.id as number, owner, date: r.date as string, budget_month: r.budgetMonth as string,
      description: r.description as string, description_norm: descriptionNorm(r.description as string),
      account_id: r.accountId as number, category_id: r.categoryId as number, type: r.type as string,
      amount_cents: r.amountCents as number, cancelled: bit(r.cancelled), notes: orNull(r.notes),
      created_at: orNull(r.createdAt), plan_id: orNull(r.planId), installment_index: orNull(r.installmentIndex),
      flag_id: orNull(r.flagId), settled_by: orNull(r.settledBy), report_count: orNull(r.reportCount),
      report_covered_cents: orNull(r.reportCoveredCents),
    }),
    ...[...((r.labelIds as number[] | undefined) ?? [])]
      .sort((a, b) => a - b)
      .map((labelId) => insert('transaction_labels', { transaction_id: r.id as number, label_id: labelId })),
  ],
  attachments: (owner, r) => [
    insert('transaction_attachments', {
      id: r.id as number, owner, transaction_id: r.transactionId as number,
      object_key: placeholderKey(owner, r.id), thumb_key: r.hasThumb ? placeholderKey(owner, r.id, true) : null,
      content_type: r.contentType as string, byte_size: r.byteSize as number, width: orNull(r.width),
      height: orNull(r.height), original_name: orNull(r.originalName), created_at: orNull(r.createdAt),
    }),
  ],
}

/**
 * The statements that put `owner`'s ledger back, in an order that satisfies every reference, one per row. Written
 * for a database that has none of the owner's rows: against one that does, the first duplicate stops it.
 */
export function restoreStatements(owner: string, tables: BackupTables): string[] {
  return EXPORT_TABLES.flatMap((table) => tables[table].flatMap((row) => MAPPERS[table](owner, row as Row)))
}

/** The statements as one script, a statement to a line group, for a person to read and apply. */
export function restoreScript(owner: string, tables: BackupTables, generatedAt: string): string {
  const statements = restoreStatements(owner, tables)
  return [
    `-- Restore of one owner: ${statements.length} statements, generated ${generatedAt}.`,
    '-- Apply to a database that has the schema (every migration) and none of this owner\'s data.',
    ...statements.map((sql) => `${sql};`),
    '',
  ].join('\n')
}
