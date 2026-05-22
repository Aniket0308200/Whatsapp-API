import { NextRequest, NextResponse } from 'next/server'
import { verifyToken, COOKIE_NAME } from '@/lib/auth/jwt'
import { getDb, deserializeRow, deserializeRows, serializeRow } from '@/lib/db'
import { randomUUID } from 'crypto'

interface QueryRequest {
  table: string
  operation: 'select' | 'insert' | 'update' | 'delete' | 'upsert'
  cols?: string
  conditions?: Array<{ col: string; val: unknown; op: string }>
  orderBy?: Array<{ col: string; ascending: boolean }>
  limit?: number
  data?: Record<string, unknown> | Record<string, unknown>[]
  returnAfterMutation?: boolean
  single?: boolean
  maybeSingle?: boolean
}

function buildWhere(conditions: QueryRequest['conditions'] = []) {
  const parts: string[] = []
  const params: unknown[] = []
  for (const c of conditions) {
    if (c.op === 'IN') {
      const vals = c.val as unknown[]
      parts.push(`"${c.col}" IN (${vals.map(() => '?').join(', ')})`)
      params.push(...vals)
    } else if (c.op === 'IS') {
      parts.push(c.val === null ? `"${c.col}" IS NULL` : `"${c.col}" IS NOT NULL`)
    } else if (c.op === 'ILIKE') {
      parts.push(`LOWER("${c.col}") LIKE ?`)
      params.push(String(c.val).toLowerCase())
    } else {
      parts.push(`"${c.col}" ${c.op} ?`)
      params.push(c.val)
    }
  }
  return { clause: parts.length ? `WHERE ${parts.join(' AND ')}` : '', params }
}

function insertRow(db: ReturnType<typeof getDb>, table: string, data: Record<string, unknown>) {
  const row = serializeRow({ id: randomUUID(), ...data })
  const colNames = Object.keys(row).map(k => `"${k}"`).join(', ')
  const placeholders = Object.keys(row).map(() => '?').join(', ')
  db.prepare(`INSERT INTO "${table}" (${colNames}) VALUES (${placeholders})`).run(...Object.values(row) as [])
  return row
}

export async function POST(req: NextRequest) {
  const token = req.cookies.get(COOKIE_NAME)?.value
  const payload = token ? verifyToken(token) : null
  if (!payload) {
    return NextResponse.json({ data: null, error: { message: 'Unauthorized' } }, { status: 401 })
  }

  let body: QueryRequest
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ data: null, error: { message: 'Invalid JSON' } }, { status: 400 })
  }

  const {
    table, operation, cols = '*', conditions = [], orderBy = [], limit,
    data, returnAfterMutation, single, maybeSingle,
  } = body

  if (!table || !operation) {
    return NextResponse.json({ data: null, error: { message: 'table and operation required' } }, { status: 400 })
  }

  try {
    const db = getDb()
    const { clause: whereClause, params } = buildWhere(conditions)

    if (operation === 'select') {
      const safeCols = cols.includes('(') ? '*' : cols
      const orderStr = orderBy.map(o => `"${o.col}" ${o.ascending ? 'ASC' : 'DESC'}`).join(', ')
      const orderClause = orderStr ? `ORDER BY ${orderStr}` : ''
      const limitClause = limit != null ? `LIMIT ${limit}` : ''
      const sql = `SELECT ${safeCols} FROM "${table}" ${whereClause} ${orderClause} ${limitClause}`.trim()

      if (single || maybeSingle) {
        const row = db.prepare(sql).get(...(params as [])) as Record<string, unknown> | undefined
        if (!row && single) return NextResponse.json({ data: null, error: { message: 'No rows found' } })
        return NextResponse.json({ data: deserializeRow(row ?? null), error: null })
      }

      const rows = db.prepare(sql).all(...(params as [])) as Record<string, unknown>[]
      // Return count for Supabase count queries
      return NextResponse.json({ data: deserializeRows(rows), count: rows.length, error: null })
    }

    if (operation === 'insert' && data != null) {
      const rows = Array.isArray(data) ? data : [data]
      const inserted: Record<string, unknown>[] = []
      for (const d of rows) {
        inserted.push(insertRow(db, table, d as Record<string, unknown>))
      }
      const result = inserted.length === 1 ? inserted[0] : inserted

      // .insert().select().single() — return the inserted row(s)
      if (returnAfterMutation) {
        if (single || maybeSingle) {
          return NextResponse.json({ data: deserializeRow(inserted[0] ?? null), error: null })
        }
        return NextResponse.json({ data: deserializeRows(inserted), error: null })
      }
      return NextResponse.json({ data: result, error: null })
    }

    if (operation === 'update' && data != null) {
      // Do NOT auto-add updated_at — tables vary; let callers include it if needed
      const row = serializeRow(data as Record<string, unknown>)
      const setClauses = Object.keys(row).map(k => `"${k}" = ?`).join(', ')
      db.prepare(`UPDATE "${table}" SET ${setClauses} ${whereClause}`).run(...[...Object.values(row), ...params] as [])

      if (returnAfterMutation) {
        const sql = `SELECT * FROM "${table}" ${whereClause}`
        if (single || maybeSingle) {
          const updated = db.prepare(sql).get(...(params as [])) as Record<string, unknown> | undefined
          return NextResponse.json({ data: deserializeRow(updated ?? null), error: null })
        }
        const updated = db.prepare(sql).all(...(params as [])) as Record<string, unknown>[]
        return NextResponse.json({ data: deserializeRows(updated), error: null })
      }
      return NextResponse.json({ data: null, error: null })
    }

    if (operation === 'upsert' && data != null) {
      const rows = Array.isArray(data) ? data : [data]
      for (const d of rows) {
        const row = serializeRow({ id: randomUUID(), ...d })
        const colNames = Object.keys(row).map(k => `"${k}"`).join(', ')
        const placeholders = Object.keys(row).map(() => '?').join(', ')
        const updateSet = Object.keys(row).filter(k => k !== 'id').map(k => `"${k}" = excluded."${k}"`).join(', ')
        db.prepare(`INSERT INTO "${table}" (${colNames}) VALUES (${placeholders}) ON CONFLICT DO UPDATE SET ${updateSet}`).run(...Object.values(row) as [])
      }
      return NextResponse.json({ data: null, error: null })
    }

    if (operation === 'delete') {
      db.prepare(`DELETE FROM "${table}" ${whereClause}`).run(...(params as []))
      return NextResponse.json({ data: null, error: null })
    }

    return NextResponse.json({ data: null, error: { message: 'Unknown operation' } }, { status: 400 })
  } catch (err) {
    console.error('[api/db]', err)
    return NextResponse.json({ data: null, error: { message: String(err) } }, { status: 500 })
  }
}
