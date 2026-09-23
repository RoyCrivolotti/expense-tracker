import { describe, expect, it } from 'vitest'
import { makeScenario } from '../../../testing/factories'
import { activePlan, initialEditorScenario, lastAddedScenario } from './scenarioSelection'

const scenario = (id: number, sortOrder: number, isActive = false) =>
  makeScenario({ id, name: `Plan ${id}`, sortOrder, isActive })

describe('lastAddedScenario', () => {
  it('returns null when empty', () => {
    expect(lastAddedScenario([])).toBeNull()
  })

  it('picks highest sortOrder then id', () => {
    const scenarios = [scenario(1, 0), scenario(3, 2), scenario(2, 1)]
    expect(lastAddedScenario(scenarios)?.id).toBe(3)
  })
})

describe('activePlan', () => {
  it('is the scenario flagged as the plan, whatever its position', () => {
    const scenarios = [scenario(1, 0, true), scenario(2, 1)]
    expect(activePlan(scenarios)?.id).toBe(1)
  })

  it('is null when no scenario has been chosen', () => {
    expect(activePlan([scenario(1, 0), scenario(2, 1)])).toBeNull()
  })
})

describe('initialEditorScenario', () => {
  it('opens on the plan when there is one', () => {
    expect(initialEditorScenario([scenario(1, 0, true), scenario(2, 1)])?.id).toBe(1)
  })

  it('falls back to the last added scenario', () => {
    expect(initialEditorScenario([scenario(1, 0), scenario(2, 1)])?.id).toBe(2)
  })
})
