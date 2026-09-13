import { computeReceiptStorage, formatStorageSize } from '../../domain/engine/receiptStorage'
import { RECEIPT_CLIENT_POLICY } from '../../data/receiptClientPolicy'
import type { TransactionAttachment } from '../../types'
import { Card, Pill, SectionTitle } from '../components/primitives'
import styles from '../tabs/tabs.module.css'
import barStyles from './ReceiptStorageSetting.module.css'

/** Past this, the bar earns a colour — there is still room, but it is worth knowing. */
const WARN_AT = 0.8

type Tone = 'neutral' | 'warning' | 'danger'

/** One threshold table for the pill and the bar, so they cannot disagree. */
function toneFor(ratio: number): Tone {
  if (ratio >= 1) return 'danger'
  if (ratio >= WARN_AT) return 'warning'
  return 'neutral'
}

interface Props {
  attachments: TransactionAttachment[]
}

/**
 * How much of the receipts quota is gone.
 *
 * Hidden until the first receipt exists: a storage meter reading 0 B is noise
 * on a screen nobody scrolls, and the limit is enforced server-side with a clear
 * message whether or not this is on screen.
 */
export function ReceiptStorageSetting({ attachments }: Props) {
  if (attachments.length === 0) return null

  const usage = computeReceiptStorage(attachments, RECEIPT_CLIENT_POLICY.maxOwnerBytes)
  const pct = Math.round(usage.ratio * 100)
  const tone = toneFor(usage.ratio)

  return (
    <>
      <SectionTitle>Receipt storage</SectionTitle>
      <Card>
        <div className={styles.settingGroup}>
          <div className={barStyles.head}>
            <span className={barStyles.used}>
              {formatStorageSize(usage.usedBytes)}{' '}
              <span className={barStyles.muted}>
                of {formatStorageSize(usage.limitBytes)}
              </span>
            </span>
            <Pill tone={tone}>
              {/* Rounding hides the difference between "nearly nothing" and
                  "nothing", so anything non-zero floors at 1%. */}
              {usage.usedBytes > 0 && pct === 0 ? '<1%' : `${pct}%`}
            </Pill>
          </div>
          <div className={barStyles.track}>
            <div
              className={`${barStyles.fill} ${barStyles[tone]}`}
              style={{ width: `${Math.max(1, pct)}%` }}
            />
          </div>
          <p className={styles.settingHint}>
            {usage.count} receipt{usage.count === 1 ? '' : 's'} stored. Photos are shrunk before
            upload, so most are well under a megabyte. Deleting a receipt frees its space
            immediately.
          </p>
        </div>
      </Card>
    </>
  )
}
