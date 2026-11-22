import { listAccessGroups } from '../../_shared/access/accessGroupService'
import type { Env, ExpensesData } from '../../_shared/env'
import { json } from '../../_shared/http'

export const onRequestGet: PagesFunction<Env, string, ExpensesData> = () => {
  return json({ groups: listAccessGroups() })
}
