import type { Account } from '../domain/types'
import type { DeleteAccountOptions, DeleteAccountResult, NewAccount } from '../domain/data/dataSource'
import { buildUpdate, type ColumnMap, type Coerce } from './dbUpdate'
import type { Env } from './env'
import { HttpError } from './http'
import { assertOwnedAccount } from './ownership'
import { toAccount, type AccountRow } from './rows'

const ACCOUNT_COLUMNS: ColumnMap<NewAccount> = {
  name: 'name',
  kind: 'kind',
  settlement: 'settlement',
  active: 'active',
}
const coerceAccount: Coerce<NewAccount> = (
  key,
  value,
) => (key === 'active' ? (value ? 1 : 0) : (value ?? null))

export async function createAccount(
  env: Env,
  owner: string,
  input: NewAccount,
): Promise<Account> {
  const row = await env.DB.prepare(
    `INSERT INTO accounts (owner, name, kind, settlement, active) VALUES (?, ?, ?, ?, ?) RETURNING *`,
  )
    .bind(owner, input.name, input.kind, input.settlement, input.active ? 1 : 0)
    .first<AccountRow>()
  if (!row) throw new HttpError(500, 'Account insert failed')
  return toAccount(row)
}

export async function updateAccount(
  env: Env,
  owner: string,
  id: number,
  patch: Partial<NewAccount>,
): Promise<Account> {
  const { sets, values } = buildUpdate(ACCOUNT_COLUMNS, patch, coerceAccount)
  const row = await env.DB.prepare(`UPDATE accounts SET ${sets} WHERE id = ? AND owner = ? RETURNING *`)
    .bind(...values, id, owner)
    .first<AccountRow>()
  if (!row) throw new HttpError(404, 'Account not found')
  return toAccount(row)
}

async function countAccountUsage(
  env: Env,
  owner: string,
  id: number,
): Promise<number> {
  const [txns, plans, statements] = await Promise.all([
    env.DB.prepare('SELECT COUNT(*) AS n FROM transactions WHERE account_id = ? AND owner = ?')
      .bind(id, owner)
      .first<{ n: number }>(),
    env.DB.prepare('SELECT COUNT(*) AS n FROM installment_plans WHERE account_id = ? AND owner = ?')
      .bind(id, owner)
      .first<{ n: number }>(),
    env.DB.prepare('SELECT COUNT(*) AS n FROM account_statements WHERE account_id = ? AND owner = ?')
      .bind(id, owner)
      .first<{ n: number }>(),
  ])
  return (txns?.n ?? 0) + (plans?.n ?? 0) + (statements?.n ?? 0)
}

async function deletePlainAccount(
  env: Env,
  owner: string,
  id: number,
): Promise<DeleteAccountResult> {
  const usage = await countAccountUsage(env, owner, id)
  if (usage > 0) throw new HttpError(409, `Account is in use by ${usage} record(s)`)
  // An unused account can still be settings.defaultAccountId (e.g. set as default, then
  // never actually used) — clear it in the same batch so the delete can't leave it dangling.
  const results = await env.DB.batch([
    env.DB.prepare('UPDATE settings SET default_account_id = NULL WHERE owner = ? AND default_account_id = ?').bind(
      owner,
      id,
    ),
    env.DB.prepare('DELETE FROM accounts WHERE id = ? AND owner = ?').bind(id, owner),
  ])
  const deleteResult = results[results.length - 1]
  if ((deleteResult?.meta.changes ?? 0) === 0) throw new HttpError(404, 'Account not found')
  return { reassignedToId: null }
}

async function resolveAccountDeleteTarget(
  env: Env,
  owner: string,
  id: number,
  reassignToId: number | undefined,
  createInput: NewAccount | undefined,
): Promise<{ targetId: number; createdAccount?: Account }> {
  if (createInput) {
    const createdAccount = await createAccount(env, owner, createInput)
    return { targetId: createdAccount.id, createdAccount }
  }
  if (reassignToId === id) throw new HttpError(400, 'Cannot reassign an account to itself')
  await assertOwnedAccount(env, owner, reassignToId!)
  return { targetId: reassignToId! }
}

export async function deleteAccount(
  env: Env,
  owner: string,
  id: number,
  options?: DeleteAccountOptions,
): Promise<DeleteAccountResult> {
  const { reassignToId, createAccount: createInput } = options ?? {}
  if (reassignToId != null && createInput) {
    throw new HttpError(400, 'Specify either reassignToId or createAccount, not both')
  }

  if (reassignToId == null && !createInput) {
    return deletePlainAccount(env, owner, id)
  }

  const { targetId, createdAccount } = await resolveAccountDeleteTarget(env, owner, id, reassignToId, createInput)

  try {
    // account_statements has a composite key of (owner, account_id, year_month); if the
    // target already has a statement for a month the source also has, moving the source's
    // row would collide with it. Drop the source's row for those overlapping months first
    // (the target's existing paid state wins), then move whatever is left, then the rest
    // of the reassignment + delete — all as one D1 batch so it's all-or-nothing.
    const results = await env.DB.batch([
      env.DB.prepare('UPDATE transactions SET account_id = ? WHERE account_id = ? AND owner = ?').bind(
        targetId,
        id,
        owner,
      ),
      env.DB.prepare('UPDATE installment_plans SET account_id = ? WHERE account_id = ? AND owner = ?').bind(
        targetId,
        id,
        owner,
      ),
      env.DB.prepare(
        `DELETE FROM account_statements
         WHERE owner = ? AND account_id = ?
           AND year_month IN (
             SELECT year_month FROM account_statements WHERE owner = ? AND account_id = ?
           )`,
      ).bind(owner, id, owner, targetId),
      env.DB.prepare('UPDATE account_statements SET account_id = ? WHERE account_id = ? AND owner = ?').bind(
        targetId,
        id,
        owner,
      ),
      // If the deleted account was the configured default, move the default along with
      // everything else — otherwise settings keeps pointing at a row that no longer exists.
      env.DB.prepare('UPDATE settings SET default_account_id = ? WHERE owner = ? AND default_account_id = ?').bind(
        targetId,
        owner,
        id,
      ),
      env.DB.prepare('DELETE FROM accounts WHERE id = ? AND owner = ?').bind(id, owner),
    ])
    const deleteResult = results[results.length - 1]
    if ((deleteResult?.meta.changes ?? 0) === 0) throw new HttpError(404, 'Account not found')

    return { reassignedToId: targetId, ...(createdAccount ? { createdAccount } : {}) }
  } catch (err) {
    // See the matching comment in deleteCategory: inline-create can't join this batch,
    // so a failure here leaves a just-created, unused account behind. Best-effort cleanup.
    if (createdAccount) await deleteOrphanedAccount(env, owner, createdAccount.id)
    throw err
  }
}

async function deleteOrphanedAccount(
  env: Env,
  owner: string,
  id: number,
): Promise<void> {
  try {
    await env.DB.prepare('DELETE FROM accounts WHERE id = ? AND owner = ?').bind(id, owner).run()
  } catch {
    /* best-effort cleanup; the original error is what the caller should see */
  }
}
