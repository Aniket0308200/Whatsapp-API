import type Database from 'better-sqlite3';
import { randomUUID } from 'crypto';
import { deserializeRow, deserializeRows, serializeRow } from './index';

type Condition = { col: string; val: unknown; op: string };
type OrderClause = { col: string; ascending: boolean };

export type SupabaseResult<T = unknown> = {
  data: T | null;
  error: { message: string } | null;
  count?: number;
};

export class QueryBuilder<T = Record<string, unknown>> {
  private _table: string;
  private _db: Database.Database;
  private _userId: string | null;
  private _operation: 'select' | 'insert' | 'update' | 'delete' | 'upsert' =
    'select';
  private _cols = '*';
  private _conditions: Condition[] = [];
  private _orderBy: OrderClause[] = [];
  private _limitVal: number | null = null;
  private _insertData:
    | Record<string, unknown>
    | Record<string, unknown>[]
    | null = null;
  private _updateData: Record<string, unknown> | null = null;
  private _upsertData: Record<string, unknown> | null = null;
  private _isSingle = false;
  private _isMaybeSingle = false;
  private _upsertConflict: string | null = null;
  private _returnAfterMutation = false;

  constructor(db: Database.Database, table: string, userId: string | null) {
    this._db = db;
    this._table = table;
    this._userId = userId;
  }

  select(cols = '*', _opts?: { count?: string; head?: boolean }) {
    if (
      this._operation === 'insert' ||
      this._operation === 'update' ||
      this._operation === 'upsert'
    ) {
      // .insert().select() — keep mutation op, flag we want data back
      this._returnAfterMutation = true;
      this._cols = cols.includes('(') ? '*' : cols;
    } else {
      this._operation = 'select';
      this._cols = cols.includes('(') ? '*' : cols;
    }
    return this;
  }

  insert(data: Record<string, unknown> | Record<string, unknown>[]) {
    this._operation = 'insert';
    this._insertData = data;
    return this;
  }

  update(data: Record<string, unknown>) {
    this._operation = 'update';
    this._updateData = data;
    return this;
  }

  upsert(data: Record<string, unknown>, options?: { onConflict?: string }) {
    this._operation = 'upsert';
    this._upsertData = data;
    this._upsertConflict = options?.onConflict ?? null;
    return this;
  }

  delete() {
    this._operation = 'delete';
    return this;
  }

  eq(col: string, val: unknown) {
    this._conditions.push({ col, val, op: '=' });
    return this;
  }

  neq(col: string, val: unknown) {
    this._conditions.push({ col, val, op: '!=' });
    return this;
  }

  in(col: string, vals: unknown[]) {
    this._conditions.push({ col, val: vals, op: 'IN' });
    return this;
  }

  is(col: string, val: unknown) {
    this._conditions.push({ col, val, op: 'IS' });
    return this;
  }

  ilike(col: string, pattern: string) {
    this._conditions.push({ col, val: pattern.toLowerCase(), op: 'ILIKE' });
    return this;
  }

  gte(col: string, val: unknown) {
    this._conditions.push({ col, val, op: '>=' });
    return this;
  }

  gt(col: string, val: unknown) {
    this._conditions.push({ col, val, op: '>' });
    return this;
  }

  lte(col: string, val: unknown) {
    this._conditions.push({ col, val, op: '<=' });
    return this;
  }

  lt(col: string, val: unknown) {
    this._conditions.push({ col, val, op: '<' });
    return this;
  }

  or(condStr: string) {
    // Append raw OR condition as a marker; simple pass-through
    this._conditions.push({ col: '__or__', val: condStr, op: 'OR' });
    return this;
  }

  order(col: string, opts?: { ascending?: boolean }) {
    this._orderBy.push({ col, ascending: opts?.ascending ?? true });
    return this;
  }

  limit(n: number) {
    this._limitVal = n;
    return this;
  }

  range(from: number, to: number) {
    this._limitVal = to - from + 1;
    return this;
  }

  single(): Promise<SupabaseResult<T>> {
    this._isSingle = true;
    return this._execute();
  }

  maybeSingle(): Promise<SupabaseResult<T>> {
    this._isMaybeSingle = true;
    return this._execute();
  }

  then<TResult1 = SupabaseResult<T[]>, TResult2 = never>(
    onfulfilled?:
      | ((value: SupabaseResult<T[]>) => TResult1 | PromiseLike<TResult1>)
      | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
  ): Promise<TResult1 | TResult2> {
    return this._execute().then(onfulfilled as any, onrejected as any);
  }

  private _buildWhere(): { clause: string; params: unknown[] } {
    const parts: string[] = [];
    const params: unknown[] = [];

    for (const c of this._conditions) {
      if (c.op === 'OR') continue; // handled separately if needed
      if (c.op === 'IN') {
        const vals = c.val as unknown[];
        const placeholders = vals.map(() => '?').join(', ');
        parts.push(`"${c.col}" IN (${placeholders})`);
        params.push(...vals);
      } else if (c.op === 'IS') {
        if (c.val === null) {
          parts.push(`"${c.col}" IS NULL`);
        } else {
          parts.push(`"${c.col}" IS NOT NULL`);
        }
      } else if (c.op === 'ILIKE') {
        parts.push(`LOWER("${c.col}") LIKE ?`);
        params.push(c.val);
      } else {
        parts.push(`"${c.col}" ${c.op} ?`);
        params.push(c.val);
      }
    }

    return {
      clause: parts.length ? `WHERE ${parts.join(' AND ')}` : '',
      params,
    };
  }

  private async _execute(): Promise<SupabaseResult> {
    try {
      const db = this._db;
      const { clause: whereClause, params } = this._buildWhere();

      if (this._operation === 'select') {
        const orderStr = this._orderBy
          .map((o) => `"${o.col}" ${o.ascending ? 'ASC' : 'DESC'}`)
          .join(', ');
        const orderClause = orderStr ? `ORDER BY ${orderStr}` : '';
        const limitClause =
          this._limitVal != null ? `LIMIT ${this._limitVal}` : '';

        const sql =
          `SELECT ${this._cols} FROM "${this._table}" ${whereClause} ${orderClause} ${limitClause}`.trim();

        if (this._isSingle || this._isMaybeSingle) {
          const row = db.prepare(sql).get(...(params as [])) as
            | Record<string, unknown>
            | undefined;
          if (!row && this._isSingle) {
            return { data: null, error: { message: 'No rows found' } };
          }
          return { data: deserializeRow(row ?? null), error: null };
        }

        const rows = db.prepare(sql).all(...(params as [])) as Record<
          string,
          unknown
        >[];
        return { data: deserializeRows(rows), error: null };
      }

      if (this._operation === 'insert') {
        const rows = Array.isArray(this._insertData)
          ? this._insertData
          : [this._insertData!];
        const inserted: Record<string, unknown>[] = [];
        for (const d of rows) {
          const row = serializeRow({ id: randomUUID(), ...d });
          const cols = Object.keys(row)
            .map((k) => `"${k}"`)
            .join(', ');
          const placeholders = Object.keys(row)
            .map(() => '?')
            .join(', ');
          db.prepare(
            `INSERT INTO "${this._table}" (${cols}) VALUES (${placeholders})`
          ).run(...(Object.values(row) as []));
          inserted.push(row);
        }
        if (this._returnAfterMutation) {
          if (this._isSingle || this._isMaybeSingle) {
            return { data: deserializeRow(inserted[0] ?? null), error: null };
          }
          return { data: deserializeRows(inserted), error: null };
        }
        return {
          data: inserted.length === 1 ? inserted[0] : inserted,
          error: null,
        };
      }

      if (this._operation === 'update') {
        // No auto-added updated_at — tables vary; callers include it if needed
        const data = serializeRow(this._updateData!);
        const setClauses = Object.keys(data)
          .map((k) => `"${k}" = ?`)
          .join(', ');
        const vals = [...Object.values(data), ...params];
        db.prepare(
          `UPDATE "${this._table}" SET ${setClauses} ${whereClause}`
        ).run(...(vals as []));
        if (this._returnAfterMutation) {
          const sql = `SELECT ${this._cols} FROM "${this._table}" ${whereClause}`;
          if (this._isSingle || this._isMaybeSingle) {
            const updated = db.prepare(sql).get(...(params as [])) as
              | Record<string, unknown>
              | undefined;
            return { data: deserializeRow(updated ?? null), error: null };
          }
          const updated = db.prepare(sql).all(...(params as [])) as Record<
            string,
            unknown
          >[];
          return { data: deserializeRows(updated), error: null };
        }
        return { data: null, error: null };
      }

      if (this._operation === 'upsert') {
        const rows = Array.isArray(this._upsertData)
          ? this._upsertData
          : [this._upsertData!];
        for (const d of rows) {
          const row = serializeRow({ id: randomUUID(), ...d });
          const cols = Object.keys(row)
            .map((k) => `"${k}"`)
            .join(', ');
          const placeholders = Object.keys(row)
            .map(() => '?')
            .join(', ');
          const updateSet = Object.keys(row)
            .filter((k) => k !== 'id')
            .map((k) => `"${k}" = excluded."${k}"`)
            .join(', ');
          db.prepare(
            `INSERT INTO "${this._table}" (${cols}) VALUES (${placeholders}) ON CONFLICT DO UPDATE SET ${updateSet}`
          ).run(...(Object.values(row) as []));
        }
        return { data: null, error: null };
      }

      if (this._operation === 'delete') {
        const sql = `DELETE FROM "${this._table}" ${whereClause}`;
        db.prepare(sql).run(...(params as []));
        return { data: null, error: null };
      }

      return { data: null, error: { message: 'Unknown operation' } };
    } catch (err) {
      console.error('[QueryBuilder] error:', err);
      return { data: null, error: { message: String(err) } };
    }
  }
}
