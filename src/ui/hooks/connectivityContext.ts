import { createContext } from 'react'

export interface ConnectivityState {
  online: boolean
  readOnly: boolean
  snapshotAt?: string
}

export const ConnectivityContext = createContext<ConnectivityState>({
  online: true,
  readOnly: false,
})
