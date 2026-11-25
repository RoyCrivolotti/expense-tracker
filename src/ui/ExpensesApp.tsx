import { useEffect, useState, lazy, Suspense } from 'react'
import type { ExpenseDataSource } from '../data/dataSource'
import { useExpenseData, type ExpenseData } from './useExpenseData'
import { currentLedgerMode } from '../config/ledgerMode'
import { type GroupGrants } from '../domain/accessGroups'
import { LeaveGuardProvider } from './nav/LeaveGuardProvider'
import { prefetchOnboardingWizard } from './components/onboardingChunk'
import { AppLoadingSkeleton } from './components/AppLoadingSkeleton'
import { isOnboardingSkipped } from './onboarding/onboardingStorage'
import { AccountOwnerContext, forgetUnownedSettings } from './hooks/accountOwner'
import { ConnectivityProvider } from './hooks/ConnectivityProvider'
import { AssumedInflationContext } from './hooks/assumedInflationContext'
import { MarketVolatilityContext } from './hooks/marketVolatilityContext'
import { MoneyFormatProvider } from './hooks/MoneyFormatProvider'
import { ExpensesAppReady, type ReadyProps } from './ExpensesAppReady'
import styles from './ExpensesApp.module.css'

const LedgerExpensesApp = lazy(() => import('./LedgerExpensesApp'))

export interface ExpensesAppProps {
  source: ExpenseDataSource
  ownerAccess?: { pendingCount: number }
  accountEmail?: string
  hubGrants: GroupGrants
}

/**
 * Reads the ledger in parts (`src/config/ledgerMode.ts`) unless this browser turned that off, and then reads the
 * whole dataset, as it always did. The ledger path is a separate chunk, which a browser that turned it off downloads
 * and never runs. It hands back to `DatasetApp` for a source without parts, for a ledger with a month of more rows
 * than one request returns, and when the reference cannot be read and nothing is saved.
 */
export function ExpensesApp(props: ExpensesAppProps) {
  const [mode] = useState(currentLedgerMode)
  const { canWrite } = props.source
  const { accountEmail } = props
  useEffect(() => {
    if (canWrite && !isOnboardingSkipped(accountEmail)) prefetchOnboardingWizard()
  }, [canWrite, accountEmail])
  if (mode === 'off') return <DatasetApp {...props} />
  return (
    <Suspense fallback={<AppLoadingSkeleton label="Loading expenses" />}>
      <LedgerExpensesApp {...props} mode={mode} fallback={<DatasetApp {...props} />} view={ExpensesAppView} />
    </Suspense>
  )
}

function DatasetApp(props: ExpensesAppProps) {
  return <ExpensesAppView {...props} data={useExpenseData(props.source, props.accountEmail)} />
}

/** The app over data a hook has loaded: the whole dataset (`useExpenseData`) or a ledger (`useLedgerData`). */
export function ExpensesAppView({
  source,
  ownerAccess,
  accountEmail,
  hubGrants,
  data,
}: ExpensesAppProps & { data: ExpenseData }) {
  if (data.status === 'loading') return <AppLoadingSkeleton label="Loading expenses" />
  if (data.status === 'error' || !data.model) {
    return (
      <div className={styles.center}>
        <p>Couldn&apos;t load expense data{data.error ? `: ${data.error}` : ''}.</p>
        <button type="button" className={styles.retryButton} onClick={data.reload}>
          Try again
        </button>
      </div>
    )
  }

  return (
    <ExpensesAppLoaded
      source={source}
      model={data.model}
      applyPatch={data.applyPatch}
      reload={data.reload}
      refreshing={data.refreshing}
      refreshOutcome={data.refreshOutcome}
      fromCache={data.fromCache ?? false}
      {...(data.snapshotAt ? { snapshotAt: data.snapshotAt } : {})}
      {...(data.viewMonth ? { viewMonth: data.viewMonth } : {})}
      hydrating={data.hydrating ?? false}
      hubGrants={hubGrants}
      {...(ownerAccess ? { ownerAccess } : {})}
      {...(accountEmail ? { accountEmail } : {})}
    />
  )
}
function ExpensesAppLoaded({
  source,
  model,
  applyPatch,
  reload,
  refreshing,
  refreshOutcome,
  fromCache,
  snapshotAt,
  viewMonth,
  hydrating,
  ownerAccess,
  accountEmail,
  hubGrants,
}: ReadyProps & { fromCache: boolean; snapshotAt?: string }) {
  // What earlier builds kept on this device under keys that named no one cannot be told apart, so it is dropped.
  useEffect(() => {
    if (accountEmail) forgetUnownedSettings()
  }, [accountEmail])
  return (
    <AccountOwnerContext value={accountEmail}>
      <ConnectivityProvider fromCache={fromCache} {...(snapshotAt ? { snapshotAt } : {})}>
        <MoneyFormatProvider
          currencyCode={model.dataset.settings.currencyCode}
          numberLocale={model.dataset.settings.numberLocale}
        >
          <AssumedInflationContext.Provider value={model.dataset.settings.assumedInflation}>
            <MarketVolatilityContext.Provider value={model.dataset.settings.marketVolatility}>
              <LeaveGuardProvider>
                <ExpensesAppReady
                  source={source}
                  model={model}
                  applyPatch={applyPatch}
                  reload={reload}
                  refreshing={refreshing}
                  refreshOutcome={refreshOutcome}
                  {...(viewMonth ? { viewMonth } : {})}
                  hydrating={hydrating}
                  hubGrants={hubGrants}
                  {...(ownerAccess ? { ownerAccess } : {})}
                  {...(accountEmail ? { accountEmail } : {})}
                />
              </LeaveGuardProvider>
            </MarketVolatilityContext.Provider>
          </AssumedInflationContext.Provider>
        </MoneyFormatProvider>
      </ConnectivityProvider>
    </AccountOwnerContext>
  )
}
