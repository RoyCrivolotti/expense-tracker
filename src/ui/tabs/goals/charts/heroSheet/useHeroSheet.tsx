import { useCallback, useMemo, useState, type ReactNode, type RefObject } from 'react'
import { PresenceValue } from '../../../../components/Presence'
import { EXIT_MS } from '../../../../hooks/motion'
import { HeroWindowPicker } from '../HeroWindowPicker'
import type { HeroWindowKey, heroWindowsFor } from '../heroWindow'
import { usePhone } from '../sheetOrientation'
import { HeroChartSheet } from './HeroChartSheet'
import type { HeroSheetModel } from './heroSheetModel'

/** What the card has worked out and the sheet draws from: the model, and the window buttons it shares. */
export type HeroSheetInputs = Omit<HeroSheetModel, 'windowPicker'> & {
  windows: ReturnType<typeof heroWindowsFor>
  windowValue: HeroWindowKey
  onWindowChange: (next: HeroWindowKey) => void
}

/**
 * The full-screen chart for the hero card: whether it can be opened here, how, and the sheet
 * itself to render. It is for a phone only (a tablet or a laptop gives the card the room), opens on
 * the last year the card had pointed at, and leaves the card as the sheet left it, so closing it shows
 * the window and lines the sheet was changed to.
 */
export function useHeroSheet(
  { windows, windowValue, onWindowChange, ...rest }: HeroSheetInputs,
  enabled: boolean,
  lastIndex: RefObject<number | null>,
): { onOpen: (() => void) | undefined; sheet: ReactNode } {
  const canOpen = usePhone() && enabled
  const [shown, setShown] = useState<{ index: number | null } | null>(null)
  const onOpen = useCallback(() => setShown({ index: lastIndex.current }), [lastIndex])
  const onClose = useCallback(() => setShown(null), [])
  const { chart, legend, displaySwitch, money } = rest
  const model = useMemo<HeroSheetModel>(
    () => ({
      chart,
      legend,
      displaySwitch,
      money,
      windowPicker: <HeroWindowPicker windows={windows} value={windowValue} onChange={onWindowChange} />,
    }),
    [chart, legend, displaySwitch, money, windows, windowValue, onWindowChange],
  )
  const sheet = (
    <PresenceValue value={canOpen ? shown : null} exitMs={EXIT_MS.fade}>
      {(state) => <HeroChartSheet model={model} initialIndex={state.index} onClose={onClose} />}
    </PresenceValue>
  )
  return { onOpen: canOpen ? onOpen : undefined, sheet }
}
