import type { ReactNode } from 'react'
import type { NewGoalScenario } from '../../../data/dataSource'
import type { LeverKey } from '../../../engine'

/**
 * What each section of the controls holds, apart from the frame it sits in: the phone's
 * collapsible sections (GoalControls) and the wide screen's columns (desktop/AllInputsPanel)
 * both lay these out. `omit` is the inputs that live in the levers bar instead, so one input is
 * never on screen twice.
 */
export interface SectionProps {
  draft: NewGoalScenario
  onChange: (patch: Partial<NewGoalScenario>) => void
  omit?: ReadonlySet<LeverKey>
  /** Puts something around an input that can be in the bar (the star that sends it there); the phone has nothing around them. */
  wrap?: (
    key: LeverKey,
    field: ReactNode,
  ) => ReactNode
}

/** No frame around an input: what the phone uses. */
export const plain = (
  _key: LeverKey,
  field: ReactNode,
): ReactNode => field
