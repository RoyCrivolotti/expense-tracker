/** Access group registry — extend here when adding new private resource groups. */
export const ACCESS_GROUPS = {
  expenses: {
    id: 'expenses',
    label: 'Expense Tracker',
  },
  finance: {
    id: 'finance',
    label: 'Financial documents',
  },
  legacy: {
    id: 'legacy',
    label: 'Legacy site (2019)',
  },
} as const

export type AccessGroupId = keyof typeof ACCESS_GROUPS

export const ACCESS_GROUP_IDS = ['expenses', 'finance', 'legacy'] as const satisfies readonly AccessGroupId[]

export type GroupGrants = Record<AccessGroupId, boolean>

export const DEFAULT_APPROVE_GROUPS: readonly AccessGroupId[] = ['expenses']

export function isAccessGroupId(value: string): value is AccessGroupId {
  return (ACCESS_GROUP_IDS as readonly string[]).includes(value)
}

export function allGroupsGranted(): GroupGrants {
  return {
    expenses: true,
    finance: true,
    legacy: true,
  }
}

export function emptyGroupGrants(): GroupGrants {
  return {
    expenses: false,
    finance: false,
    legacy: false,
  }
}

export function hasGroupGrant(grants: GroupGrants, groupId: AccessGroupId): boolean {
  return grants[groupId]
}

export function filterByGroupAccess<T extends { groupId: AccessGroupId }>(
  items: T[],
  grants: GroupGrants,
): T[] {
  return items.filter((item) => hasGroupGrant(grants, item.groupId))
}

export function listAccessGroupMeta(): Array<{ id: AccessGroupId; label: string }> {
  return ACCESS_GROUP_IDS.map((id) => ({
    id,
    label: ACCESS_GROUPS[id].label,
  }))
}
