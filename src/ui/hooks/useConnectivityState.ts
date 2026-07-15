import { useContext } from 'react'
import { ConnectivityContext } from './connectivityContext'

export function useConnectivityState() {
  return useContext(ConnectivityContext)
}
