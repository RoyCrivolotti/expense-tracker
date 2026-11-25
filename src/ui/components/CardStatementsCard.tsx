import { useMemo, useState } from 'react'
import type { ExpenseDataset } from '../../types'
import type { ExpenseActions } from '../actions'
import { EXIT_MS } from '../hooks/motion'
import { useToast } from '../hooks/useToast'
import { PresenceValue } from './Presence'
import { StatementPaymentSheet } from './StatementPaymentSheet'
import { buildStatementRows, type StatementRow } from './cardStatementRows'
import { makeStatementSaves } from './cardStatementSaves'
import { StatementList } from './StatementList'
import { Card, SectionTitle } from './primitives'

interface CardStatementsCardProps {
  dataset: ExpenseDataset
  month: string
  actions?: ExpenseActions | undefined
}

export function CardStatementsCard({ dataset, month, actions }: CardStatementsCardProps) {
  const [pending, setPending] = useState<ReadonlySet<number>>(() => new Set())
  const [editingId, setEditingId] = useState<number | null>(null)
  const { showToast } = useToast()

  const statements = useMemo<StatementRow[]>(() => buildStatementRows(dataset, month), [dataset, month])

  if (statements.length === 0) return null

  const { save, markPaidToday } = makeStatementSaves(actions, month, setPending, showToast)

  const editing = statements.find((s) => s.id === editingId) ?? null

  return (
    <>
      <SectionTitle>Card statements</SectionTitle>
      <Card>
        <StatementList
          statements={statements}
          canSave={save !== undefined}
          pending={pending}
          markPaidToday={markPaidToday}
          onOpen={setEditingId}
        />
      </Card>
      <PresenceValue value={save ? editing : null} exitMs={EXIT_MS.sheet}>
        {(statement) =>
          save && (
            <StatementPaymentSheet
              cardName={statement.name}
              yearMonth={month}
              amountCents={statement.chargeCents}
              paid={statement.paid}
              paidOn={statement.paidOn}
              disabled={pending.has(statement.id)}
              onClose={() => setEditingId(null)}
              onSave={(paid, paidOn) => save(statement.id, paid, paidOn)}
            />
          )
        }
      </PresenceValue>
    </>
  )
}
