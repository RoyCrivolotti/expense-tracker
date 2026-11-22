import type { PushRepository } from '../../../src/domain/ports/pushRepository'
import type { Env } from '../env'
import {
  DELETE_SUBSCRIPTION_SQL,
  CLAIM_SUMMARY_SQL,
  GET_SETTINGS_SQL,
  ID_OF_ENDPOINT_SQL,
  LIST_DEVICES_SQL,
  LIST_SUMMARY_PEOPLE_SQL,
  LIST_TARGETS_SQL,
  RECORD_SEND_SQL,
  SAVE_SETTINGS_IF_MISSING_SQL,
  SAVE_SETTINGS_SQL,
  SAVE_SUBSCRIPTION_SQL,
  subscriptionParams,
  toDevice,
  toSettings,
  type DeviceRow,
  type SettingsRow,
  type SummaryRow,
  type TargetRow,
} from '../push/pushSql'
import { changed, rows } from './d1CaptureSupport'

export function createD1PushRepository(env: Pick<Env, 'DB'>): PushRepository {
  const db = env.DB
  return {
    saveSubscription: async (s) => {
      if (!(await changed(db, SAVE_SUBSCRIPTION_SQL, ...subscriptionParams(s)))) return null
      const row = await db.prepare(ID_OF_ENDPOINT_SQL).bind(s.endpoint).first<{ id: string }>()
      return row?.id ?? null
    },
    listDevices: async (owner) => (await rows<DeviceRow>(db, LIST_DEVICES_SQL, owner)).map(toDevice),
    listTargets: (owner) => rows<TargetRow>(db, LIST_TARGETS_SQL, owner),
    recordSend: async (
      owner,
      id,
      status,
      at,
    ) => {
      await changed(db, RECORD_SEND_SQL, owner, id, at, status)
    },
    deleteSubscription: (
      owner,
      id,
    ) => changed(db, DELETE_SUBSCRIPTION_SQL, owner, id),
    getSettings: async (owner) => {
      const row = await db.prepare(GET_SETTINGS_SQL).bind(owner).first<SettingsRow>()
      return row ? toSettings(row) : null
    },
    listSummaryPeople: async () =>
      (await rows<SummaryRow>(db, LIST_SUMMARY_PEOPLE_SQL)).map((r) => ({ owner: r.owner, ...toSettings(r) })),
    claimSummary: (
      owner,
      expected,
      at,
    ) => changed(db, CLAIM_SUMMARY_SQL, owner, expected, at),
    saveSettings: async (
      owner,
      settings,
      onlyIfMissing,
    ) => {
      await changed(
        db,
        onlyIfMissing ? SAVE_SETTINGS_IF_MISSING_SQL : SAVE_SETTINGS_SQL,
        owner,
        settings.mode,
        settings.timeZone,
      )
    },
  }
}
