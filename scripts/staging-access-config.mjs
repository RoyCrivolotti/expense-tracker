import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

export function loadStagingAccessConfig(root = ROOT) {
  const filePath = join(root, 'config/staging-access.json')
  return JSON.parse(readFileSync(filePath, 'utf8'))
}
