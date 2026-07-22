import { useState } from 'react'
import type { InstallmentPlan } from '../../types'
import type { ExpenseModel } from '../useExpenseData'
import type { ExpenseActions } from '../actions'
import { planProgress } from '../../engine'
import { fullMonthLabel } from '../../engine/dates'
import { Card, EmptyState, SectionTitle } from '../components/primitives'
import { CategoryIcon } from '../components/CategoryIcon'
import { InstallmentPlanModal } from './InstallmentPlanModal'
import defStyles from './definitions.module.css'
import styles from './InstallmentPlansManager.module.css'

type Editing = { plan: InstallmentPlan | null } | null

function PlanRow({
  plan,
  model,
  actions,
  onEdit,
}: {
  plan: InstallmentPlan
  model: ExpenseModel
  actions: ExpenseActions
  onEdit: () => void
}) {
  const progress = planProgress(plan, model.dataset.transactions)
  const pct = Math.min(100, Math.round((progress.paidCount / plan.totalCount) * 100))
  const cat = model.lookup.category(plan.categoryId)
  return (
    <div className={plan.active ? styles.planRow : `${styles.planRow} ${styles.inactive}`}>
      <div className={styles.head}>
        <span className={styles.name}>
          <CategoryIcon icon={cat?.icon} name={cat?.name ?? plan.description} /> {plan.description}
        </span>
        <div className={styles.buttons}>
          <button type="button" className={defStyles.editBtn} onClick={onEdit}>
            Edit
          </button>
          <button
            type="button"
            className={defStyles.editBtn}
            onClick={() => void actions.updateInstallmentPlan(plan.id, { active: !plan.active })}
          >
            {plan.active ? 'Complete' : 'Reactivate'}
          </button>
          <button
            type="button"
            className={`${defStyles.editBtn} ${styles.danger}`}
            onClick={() => {
              if (window.confirm(`Delete installment plan "${plan.description}"?`)) {
                void actions.deleteInstallmentPlan(plan.id)
              }
            }}
          >
            Delete
          </button>
        </div>
      </div>
      <div className={styles.track}>
        <div className={styles.fill} style={{ width: `${pct}%` }} />
      </div>
      <span className={styles.stats}>
        {progress.paidCount}/{plan.totalCount} paid · {progress.remaining} remaining · Final{' '}
        {fullMonthLabel(progress.finalBudgetMonth)}
      </span>
    </div>
  )
}

export function InstallmentPlansManager({
  model,
  actions,
}: {
  model: ExpenseModel
  actions: ExpenseActions
}) {
  const [editing, setEditing] = useState<Editing>(null)
  const plans = model.dataset.installmentPlans

  return (
    <>
      <SectionTitle>Installment plans</SectionTitle>
      <Card>
        {plans.length === 0 ? (
          <EmptyState>No installment plans yet.</EmptyState>
        ) : (
          plans.map((plan) => (
            <PlanRow
              key={plan.id}
              plan={plan}
              model={model}
              actions={actions}
              onEdit={() => setEditing({ plan })}
            />
          ))
        )}
        <button
          type="button"
          className={defStyles.addBtn}
          onClick={() => setEditing({ plan: null })}
        >
          + Add installment plan
        </button>
      </Card>
      {editing && (
        <InstallmentPlanModal
          plan={editing.plan}
          model={model}
          actions={actions}
          onClose={() => setEditing(null)}
        />
      )}
    </>
  )
}
