import { getDb } from '@/lib/db'
import { QueryBuilder } from '@/lib/db/query-builder'

// Server-side admin client using SQLite directly (replaces Supabase service role client).
// No RLS in SQLite — this client can query any table without user scoping.
export function supabaseAdmin() {
  const db = getDb()
  return {
    from(table: string) {
      return new QueryBuilder(db, table, null)
    },
    rpc(_fn: string, _params?: Record<string, unknown>) {
      return Promise.resolve({ data: null, error: null })
    },
  }
}
