import { useEffect, useState } from 'react'
import {
  fetchAccessGroups,
  revokeAccessUser,
  updateUserGroupGrants,
  type AccessGroupMeta,
  type ActiveAccessUser,
  type AccessGroupId,
} from '../../data/accessApi'
import { Card, Pill } from '../components/primitives'
import { formatDateTime, formatRelativeTime } from './formatRelativeTime'
import styles from './AccessScreen.module.css'

function lastSeenLabel(lastSeenAt: string | null): string {
  if (!lastSeenAt) return 'No app activity yet'
  return `Last active ${formatRelativeTime(lastSeenAt)}`
}

function UserGroupToggles({
  user,
  groupMeta,
  disabled,
  onGroupsChange,
}: {
  user: ActiveAccessUser
  groupMeta: AccessGroupMeta[]
  disabled: boolean
  onGroupsChange: (email: string, groups: ActiveAccessUser['groups']) => void
}) {
  const [busyId, setBusyId] = useState<AccessGroupId | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function onToggle(groupId: AccessGroupId, enabled: boolean) {
    if (groupId === 'expenses' && !enabled) {
      if (
        !window.confirm(
          `Remove expense tracker access for ${user.email}? Their expense data will be permanently deleted.`,
        )
      ) {
        return
      }
    }
    setBusyId(groupId)
    setError(null)
    try {
      const result = await updateUserGroupGrants(user.email, { [groupId]: enabled })
      onGroupsChange(user.email, result.groups)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className={styles.groupToggles}>
      {groupMeta.map((group) => (
        <label key={group.id} className={styles.groupToggle}>
          <input
            type="checkbox"
            checked={user.groups[group.id]}
            disabled={disabled || busyId === group.id}
            onChange={(event) => void onToggle(group.id, event.target.checked)}
          />
          <span>{group.label}</span>
        </label>
      ))}
      {error ? <p className={styles.error}>{error}</p> : null}
    </div>
  )
}

export function ActiveUsersSection({
  users,
  onChange,
}: {
  users: ActiveAccessUser[]
  onChange: (next: ActiveAccessUser[]) => void
}) {
  const [busyEmail, setBusyEmail] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [groupMeta, setGroupMeta] = useState<AccessGroupMeta[]>([])

  useEffect(() => {
    fetchAccessGroups()
      .then((result) => setGroupMeta(result.groups))
      .catch(() => {
        setGroupMeta([
          { id: 'expenses', label: 'Expense Tracker' },
          { id: 'finance', label: 'Financial documents' },
          { id: 'legacy', label: 'Legacy site (2019)' },
        ])
      })
  }, [])

  function updateUserGroups(email: string, groups: ActiveAccessUser['groups']) {
    onChange(users.map((row) => (row.email === email ? { ...row, groups } : row)))
  }

  async function onRevokeAll(email: string) {
    if (
      !window.confirm(
        `Revoke all access for ${email}? Their expense data will be permanently deleted.`,
      )
    ) {
      return
    }
    setBusyEmail(email)
    setError(null)
    try {
      await revokeAccessUser(email)
      onChange(users.filter((row) => row.email !== email))
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusyEmail(null)
    }
  }

  if (users.length === 0) {
    return <p className={styles.emptyHint}>No active users yet.</p>
  }

  return (
    <>
      <ul className={styles.requestList}>
        {users.map((row) => (
          <li key={row.email}>
            <Card className={styles.requestCard}>
              <div className={styles.requestMeta}>
                <span className={styles.email}>{row.email}</span>
                <span className={styles.requestedAt} title={formatDateTime(row.grantedAt)}>
                  Granted {formatRelativeTime(row.grantedAt)}
                </span>
                <span
                  className={styles.requestedAt}
                  title={row.lastSeenAt ? formatDateTime(row.lastSeenAt) : undefined}
                >
                  {lastSeenLabel(row.lastSeenAt)}
                </span>
                {row.isOwner ? <Pill tone="success">Owner</Pill> : <Pill tone="neutral">Active</Pill>}
              </div>
              {!row.isOwner ? (
                <>
                  <UserGroupToggles
                    user={row}
                    groupMeta={groupMeta}
                    disabled={busyEmail === row.email}
                    onGroupsChange={updateUserGroups}
                  />
                  <div className={styles.requestActions}>
                    <button
                      type="button"
                      className={styles.rejectBtn}
                      disabled={busyEmail === row.email}
                      onClick={() => void onRevokeAll(row.email)}
                    >
                      {busyEmail === row.email ? 'Revoking…' : 'Revoke all'}
                    </button>
                  </div>
                </>
              ) : null}
            </Card>
          </li>
        ))}
      </ul>
      {error ? <p className={styles.error}>{error}</p> : null}
    </>
  )
}
