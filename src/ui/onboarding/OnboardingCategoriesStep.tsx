import type { CategoryDraft } from './onboardingDrafts'
import { CATEGORY_PRESETS } from '../../domain/onboarding/presets'
import { CategoryIcon } from '../components/CategoryIcon'
import styles from './OnboardingWizard.module.css'

export function OnboardingCategoriesStep({
  drafts,
  onChange,
}: {
  drafts: CategoryDraft[]
  onChange: (next: CategoryDraft[]) => void
}) {
  const selectedCount = drafts.filter((d) => d.selected).length

  return (
    <div className={styles.stepBody}>
      <p className={styles.lead}>
        Pick categories to track. Budgets are monthly — adjust anytime in Settings.
      </p>
      <ul className={styles.categoryList}>
        {drafts.map((draft, index) => {
          const preset = CATEGORY_PRESETS[index]
          if (!preset) return null
          return (
            <li key={draft.presetId} className={styles.categoryRow}>
              <label className={styles.categoryCheck}>
                <input
                  type="checkbox"
                  checked={draft.selected}
                  onChange={(e) => {
                    const next = [...drafts]
                    next[index] = { ...draft, selected: e.target.checked }
                    onChange(next)
                  }}
                />
                <CategoryIcon icon={preset.icon} name={preset.name} />
                <span>{preset.name}</span>
              </label>
              <label className={styles.budgetField}>
                <span className={styles.srOnly}>Monthly budget for {preset.name}</span>
                <input
                  type="number"
                  min="0"
                  step="10"
                  inputMode="decimal"
                  disabled={!draft.selected}
                  value={draft.budgetEuros}
                  onChange={(e) => {
                    const next = [...drafts]
                    next[index] = { ...draft, budgetEuros: e.target.value }
                    onChange(next)
                  }}
                  aria-label={`${preset.name} monthly budget in euros`}
                />
                <span className={styles.budgetSuffix}>€/mo</span>
              </label>
            </li>
          )
        })}
      </ul>
      {selectedCount === 0 ? (
        <p className={styles.hintWarn}>Select at least one category, or skip setup.</p>
      ) : null}
    </div>
  )
}
