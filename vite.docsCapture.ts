import type { ServerResponse } from 'node:http'
import type { Plugin } from 'vite'

const MOCK_PENDING = {
  requests: [
    {
      id: 'req-demo',
      email: 'guest@example.com',
      requestedAt: '2026-06-18T10:00:00.000Z',
    },
  ],
}

const MOCK_GROUPS = {
  groups: [
    { id: 'expenses', label: 'Expense Tracker' },
    { id: 'finance', label: 'Financial documents' },
    { id: 'legacy', label: 'Legacy site (2019)' },
  ],
}

const MOCK_USERS = {
  users: [
    {
      email: 'owner@example.com',
      grantedAt: '2026-06-01T08:00:00.000Z',
      grantedBy: null,
      lastSeenAt: '2026-06-19T12:00:00.000Z',
      isOwner: true,
      groups: { expenses: true, finance: true, legacy: true },
    },
    {
      email: 'guest@example.com',
      grantedAt: '2026-06-10T09:00:00.000Z',
      grantedBy: 'owner@example.com',
      lastSeenAt: null,
      isOwner: false,
      groups: { expenses: true, finance: false, legacy: false },
    },
  ],
}

function jsonResponse(res: ServerResponse, body: unknown) {
  res.writeHead(200, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify(body))
}

/** Mocks access admin APIs when DOCS_CAPTURE=1 (screenshot runs only). */
export function docsCaptureMocks(): Plugin {
  return {
    name: 'docs-capture-mocks',
    configureServer(server) {
      if (process.env.DOCS_CAPTURE !== '1') return
      server.middlewares.use((req, res, next) => {
        const path = req.url?.split('?')[0]
        if (path === '/api/access/admin/pending') {
          jsonResponse(res, MOCK_PENDING)
          return
        }
        if (path === '/api/access/admin/users') {
          jsonResponse(res, MOCK_USERS)
          return
        }
        if (path === '/api/access/groups') {
          jsonResponse(res, MOCK_GROUPS)
          return
        }
        next()
      })
    },
  }
}
