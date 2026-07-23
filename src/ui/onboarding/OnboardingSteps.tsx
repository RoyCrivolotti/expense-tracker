import styles from './OnboardingWizard.module.css'

const STEP_LABELS = ['Welcome', 'Money', 'Categories', 'Accounts'] as const

export function OnboardingProgress({ step }: { step: number }) {
  return (
    <div className={styles.progress} aria-label={`Step ${step + 1} of ${STEP_LABELS.length}`}>
      {STEP_LABELS.map((label, index) => (
        <span
          key={label}
          className={index <= step ? styles.progressDotActive : styles.progressDot}
          aria-hidden
        />
      ))}
      <span className={styles.progressLabel}>
        Step {step + 1} of {STEP_LABELS.length}
      </span>
    </div>
  )
}

export function OnboardingNav({
  onBack,
  onNext,
  nextLabel,
  nextDisabled,
  busy,
}: {
  onBack?: (() => void) | undefined
  onNext: () => void
  nextLabel: string
  nextDisabled?: boolean
  busy?: boolean
}) {
  return (
    <div className={styles.nav}>
      {onBack ? (
        <button type="button" className={styles.secondaryBtn} onClick={onBack} disabled={busy}>
          Back
        </button>
      ) : (
        <span />
      )}
      <button
        type="button"
        className={styles.primaryBtn}
        onClick={onNext}
        disabled={nextDisabled || busy}
      >
        {busy ? 'Saving…' : nextLabel}
      </button>
    </div>
  )
}
