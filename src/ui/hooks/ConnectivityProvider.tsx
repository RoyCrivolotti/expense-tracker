import { useMemo, type ReactNode } from 'react'
import { ConnectivityContext } from './connectivityContext'
import { useConnectivity } from './useConnectivity'

export function ConnectivityProvider({
  fromCache,
  snapshotAt,
  children,
}: {
  fromCache: boolean
  snapshotAt?: string
  children: ReactNode
}) {
  const online = useConnectivity()
  const value = useMemo(
    () => ({
      online,
      readOnly: !online || fromCache,
      ...(snapshotAt ? { snapshotAt } : {}),
    }),
    [online, fromCache, snapshotAt],
  )
  return <ConnectivityContext.Provider value={value}>{children}</ConnectivityContext.Provider>
}
