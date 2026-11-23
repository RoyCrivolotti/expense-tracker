import type { GoalScenario, InstallmentPlan, WealthAccount, WealthCheckin } from '../types'
import type {
  DeleteWealthAccountResult,
  NewGoalScenario,
  NewInstallmentPlan,
  NewWealthAccount,
  NewWealthCheckin,
} from '../data/dataSource'

/** Goal scenarios and installment plans. */
export interface ExpensePlanning {
  createScenario(
    owner: string,
    input: NewGoalScenario,
  ): Promise<GoalScenario>
  updateScenario(
    owner: string,
    id: number,
    patch: Partial<NewGoalScenario>,
  ): Promise<GoalScenario>
  /** Exactly one plan per owner: activating one deactivates the rest, atomically. */
  activateScenario(
    owner: string,
    id: number,
  ): Promise<GoalScenario>
  deleteScenario(
    owner: string,
    id: number,
  ): Promise<void>
  createInstallmentPlan(
    owner: string,
    input: NewInstallmentPlan,
  ): Promise<InstallmentPlan>
  updateInstallmentPlan(
    owner: string,
    id: number,
    patch: Partial<NewInstallmentPlan>,
  ): Promise<InstallmentPlan>
  deleteInstallmentPlan(
    owner: string,
    id: number,
  ): Promise<void>
}

/** Wealth accounts and their check-ins. */
export interface ExpenseWealth {
  createWealthAccount(
    owner: string,
    input: NewWealthAccount,
  ): Promise<WealthAccount>
  updateWealthAccount(
    owner: string,
    id: number,
    patch: Partial<NewWealthAccount>,
  ): Promise<WealthAccount>
  deleteWealthAccount(
    owner: string,
    id: number,
  ): Promise<DeleteWealthAccountResult>
  createWealthCheckin(
    owner: string,
    input: NewWealthCheckin,
  ): Promise<WealthCheckin>
  updateWealthCheckin(
    owner: string,
    id: number,
    patch: Partial<NewWealthCheckin>,
  ): Promise<WealthCheckin>
  deleteWealthCheckin(
    owner: string,
    id: number,
  ): Promise<void>
}
