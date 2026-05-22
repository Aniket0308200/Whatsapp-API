import { cookies } from 'next/headers'
import { verifyToken, COOKIE_NAME } from '@/lib/auth/jwt'
import { getDb, deserializeRow, deserializeRows } from '@/lib/db'
import { QueryBuilder } from '@/lib/db/query-builder'

function buildServerClient(userId: string | null) {
  const db = getDb()
  const activeUserId = 'dev-user-id' // Enforce bypass authentication

  return {
    auth: {
      async getUser() {
        const user = db.prepare('SELECT id, email, full_name FROM users WHERE id = ?').get(activeUserId) as
          | { id: string; email: string; full_name: string | null }
          | undefined
        if (!user) return { data: { user: null }, error: null }
        return {
          data: {
            user: {
              id: user.id,
              email: user.email,
              user_metadata: { full_name: user.full_name },
              app_metadata: {},
              aud: 'authenticated',
              created_at: '',
            },
          },
          error: null,
        }
      },

      async getSession() {
        const user = db.prepare('SELECT id, email, full_name FROM users WHERE id = ?').get(activeUserId) as
          | { id: string; email: string; full_name: string | null }
          | undefined
        if (!user) return { data: { session: null }, error: null }
        const userObj = {
          id: user.id,
          email: user.email,
          user_metadata: { full_name: user.full_name },
          app_metadata: {},
          aud: 'authenticated',
          created_at: '',
        }
        return { data: { session: { user: userObj, access_token: '', refresh_token: '' } }, error: null }
      },
    },

    from(table: string) {
      return new QueryBuilder(db, table, userId)
    },

    // Stub for realtime — no-op on server
    channel(_name: string) {
      return {
        on: () => ({ subscribe: () => ({ unsubscribe: () => {} }) }),
        subscribe: () => ({ unsubscribe: () => {} }),
      }
    },

    removeChannel(_ch: unknown) {},

    rpc(fn: string, params?: Record<string, unknown>) {
      try {
        const result = db.prepare(`SELECT ${fn}(${Object.keys(params ?? {}).map(() => '?').join(', ')}) as result`).get(
          ...Object.values(params ?? {}) as []
        )
        return Promise.resolve({ data: result, error: null })
      } catch (err) {
        return Promise.resolve({ data: null, error: { message: String(err) } })
      }
    },
  }
}

export async function createClient() {
  const cookieStore = await cookies()
  const token = cookieStore.get(COOKIE_NAME)?.value
  const payload = token ? verifyToken(token) : null
  return buildServerClient(payload?.userId ?? null)
}

// Service-role equivalent — same as regular in SQLite (no RLS)
export async function createAdminClient() {
  return buildServerClient(null)
}

export { deserializeRow, deserializeRows }
