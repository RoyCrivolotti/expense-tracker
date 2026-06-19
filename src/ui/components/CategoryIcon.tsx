import styles from './CategoryIcon.module.css'

interface CategoryIconProps {
  icon?: string | undefined
  name: string
  className?: string | undefined
}

/** Renders a category emoji or a neutral initial fallback. */
export function CategoryIcon({ icon, name, className }: CategoryIconProps) {
  const label = icon?.trim() || name.slice(0, 1).toUpperCase()
  return (
    <span className={[styles.icon, className].filter(Boolean).join(' ')} aria-hidden>
      {label}
    </span>
  )
}
