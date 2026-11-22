import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { ExpenseModel } from '../useExpenseData'
import { AccountView } from './AccountView'

vi.mock('./AccountSetting', () => ({ AccountSetting: ({ email }: { email: string }) => <p>signed in as {email}</p> }))
vi.mock('./AccessRequestsSetting', () => ({ AccessRequestsSetting: () => <p>access requests</p> }))
vi.mock('./AppVersionSetting', () => ({ AppVersionSetting: () => <p>version</p> }))

describe('the Account view', () => {
  it('holds the sign-in, the access requests and the build, and nothing else', () => {
    const { container } = render(
      <AccountView model={{} as ExpenseModel} ownerAccess={{ pendingCount: 1 }} accountEmail="owner@example.com" />,
    )

    expect([...container.querySelectorAll('p')].map((p) => p.textContent)).toEqual([
      'signed in as owner@example.com',
      'access requests',
      'version',
    ])
  })

  it('shows only the build to a person with no email known and no access to manage', () => {
    const { container } = render(
      <AccountView model={{} as ExpenseModel} ownerAccess={undefined} accountEmail={undefined} />,
    )

    expect(screen.getByText('version')).toBeInTheDocument()
    expect(container.querySelectorAll('p')).toHaveLength(1)
  })
})
