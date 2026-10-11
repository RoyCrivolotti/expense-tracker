import styles from './charts.module.css'

/** The class of a reference line: the picked one is solid and bright, the others fade while one is picked. */
export function refLineClass(picked: boolean, anyPicked: boolean): string {
  if (picked) return `${styles.refLine} ${styles.refLineOn}`
  return anyPicked ? `${styles.refLine} ${styles.refLineDim}` : `${styles.refLine}`
}
