/**
 * Which built chunks only the Goals tab uses, read off the imports in the built files. The budget used to count
 * the files named GoalsTab*, and a chunk the bundler splits out of the tab (the shared chart shell, and the lazy
 * spread card) is named after whatever module it starts with, so 12 KB of Goals-only code sat outside the limit.
 *
 * A static `import ... from "./x.js"` or `import "./x.js"` loads a file with the one that imports it, and an
 * `import(\`./x.js\`)` loads it later; both are followed from the Goals chunk. The files the page needs at once
 * (the entry named in index.html, and what it imports statically) are not Goals', and a walk does not go through
 * them, since the entry holds the other tabs' lazy imports. A chunk the Analytics tab reaches too is shared, so
 * it is not Goals-only either.
 */
const STATIC_IMPORT = /(?:from|import)\s*["']\.\/([A-Za-z0-9_.-]+\.js)["']/g
const DYNAMIC_IMPORT = /import\(\s*["'`]\.\/([A-Za-z0-9_.-]+\.js)["'`]\s*\)/g

function edgesOf(files, read, patterns) {
  return new Map(
    files.map((file) => {
      const source = read(file)
      const found = patterns.flatMap((re) => [...source.matchAll(re)].map((m) => m[1]))
      return [file, new Set(found.filter((name) => name !== file && files.includes(name)))]
    }),
  )
}

function reach(starts, edges, stop = new Set()) {
  const seen = new Set(starts)
  const queue = [...starts]
  while (queue.length > 0) {
    const file = queue.pop()
    for (const next of edges.get(file) ?? []) {
      if (seen.has(next) || stop.has(next)) continue
      seen.add(next)
      queue.push(next)
    }
  }
  return seen
}

/**
 * The chunks (file names) that only the Goals tab loads, the Goals chunk itself among them.
 * @param {{ files: string[], read: (file: string) => string, indexHtml: string }} build
 * @returns {string[]}
 */
export function goalsOnlyChunks({ files, read, indexHtml }) {
  const staticEdges = edgesOf(files, read, [STATIC_IMPORT])
  const allEdges = edgesOf(files, read, [STATIC_IMPORT, DYNAMIC_IMPORT])
  const entry = [...indexHtml.matchAll(/assets\/([A-Za-z0-9_.-]+\.js)/g)].map((m) => m[1]).filter((name) => files.includes(name))
  const eager = reach(entry, staticEdges)
  const named = (prefix) => files.filter((file) => file.startsWith(prefix))
  const goals = reach(named('GoalsTab'), allEdges, eager)
  const analytics = reach(named('AnalyticsTab'), allEdges, eager)
  return [...goals].filter((file) => !eager.has(file) && !analytics.has(file)).sort()
}
