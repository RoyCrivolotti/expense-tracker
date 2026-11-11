import type { PushKind, SuggestedType } from './types'

/**
 * The type a recommendation starts with. The user can change it and nothing is created until they
 * submit. Direction decides the type; the stored amount is always positive.
 */
export function suggestType(kind: PushKind): SuggestedType {
  switch (kind) {
    case 'card-purchase':
    case 'cash-withdrawal':
    case 'transfer-sent':
      return 'expense'
    case 'bizum-received':
    case 'inflow':
      return 'income'
    case 'refund':
      return 'refund'
  }
}
