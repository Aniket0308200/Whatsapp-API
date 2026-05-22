'use client';

import type { SupabaseResult } from '@/lib/db/query-builder';

// Browser-side Supabase shim — talks to our own API routes instead of Supabase.
// Matches the subset of the Supabase client API used in this codebase.

interface LocalUser {
  id: string;
  email: string;
  user_metadata?: Record<string, unknown>;
  app_metadata?: Record<string, unknown>;
  aud?: string;
  created_at?: string;
}

interface LocalSession {
  user: LocalUser;
  access_token: string;
  refresh_token: string;
}

type AuthStateEvent = 'SIGNED_IN' | 'SIGNED_OUT' | 'INITIAL_SESSION';
type AuthStateCallback = (
  event: AuthStateEvent,
  session: LocalSession | null
) => void;

let _cachedSession: { user: LocalUser; profile: unknown } | null | undefined =
  undefined;
let _authListeners: AuthStateCallback[] = [];

async function fetchMe(): Promise<{
  user: LocalUser | null;
  profile: unknown;
}> {
  try {
    const res = await fetch('/api/auth/me', { credentials: 'include' });
    if (!res.ok) return { user: null, profile: null };
    return res.json();
  } catch {
    return { user: null, profile: null };
  }
}

function notifyListeners(event: AuthStateEvent, user: LocalUser | null) {
  const session: LocalSession | null = user
    ? { user, access_token: 'local', refresh_token: 'local' }
    : null;
  _authListeners.forEach((cb) => cb(event, session));
}

class BrowserQueryBuilder<T = any> implements PromiseLike<
  SupabaseResult<T | T[]>
> {
  private _table: string;
  private _operation = 'select';
  private _cols = '*';
  private _conditions: Array<{ col: string; val: unknown; op: string }> = [];
  private _orderBy: Array<{ col: string; ascending: boolean }> = [];
  private _limitVal: number | null = null;
  private _data: Record<string, unknown> | Record<string, unknown>[] | null =
    null;
  private _isSingle = false;
  private _isMaybeSingle = false;
  // True when .select() is called after insert/update/upsert — means "return the mutated row"
  private _returnAfterMutation = false;

  constructor(table: string) {
    this._table = table;
  }

  select(cols = '*', _opts?: { count?: string; head?: boolean }) {
    if (
      this._operation === 'insert' ||
      this._operation === 'update' ||
      this._operation === 'upsert'
    ) {
      // Supabase pattern: .insert().select() — keep operation, flag we want data back
      this._returnAfterMutation = true;
      this._cols = cols;
    } else {
      this._operation = 'select';
      this._cols = cols;
    }
    return this;
  }

  insert(data: Record<string, unknown> | Record<string, unknown>[]) {
    this._operation = 'insert';
    this._data = data;
    return this;
  }

  update(data: Record<string, unknown>) {
    this._operation = 'update';
    this._data = data;
    return this;
  }

  upsert(data: Record<string, unknown>) {
    this._operation = 'upsert';
    this._data = data;
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
    this._conditions.push({ col, val: pattern, op: 'ILIKE' });
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
  or(_condStr: string) {
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
  range(_from: number, _to: number) {
    return this;
  }

  single(): Promise<SupabaseResult<T | null>> {
    this._isSingle = true;
    return this._run() as Promise<SupabaseResult<T | null>>;
  }
  maybeSingle(): Promise<SupabaseResult<T | null>> {
    this._isMaybeSingle = true;
    return this._run() as Promise<SupabaseResult<T | null>>;
  }

  then<TResult1 = SupabaseResult<T | T[]>, TResult2 = never>(
    onfulfilled?:
      | ((value: SupabaseResult<T | T[]>) => TResult1 | PromiseLike<TResult1>)
      | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
  ): Promise<TResult1 | TResult2> {
    return this._run().then(onfulfilled as any, onrejected as any);
  }

  private async _run(): Promise<SupabaseResult<T | T[]>> {
    const body = {
      table: this._table,
      operation: this._operation,
      cols: this._cols,
      conditions: this._conditions,
      orderBy: this._orderBy,
      limit: this._limitVal,
      data: this._data,
      returnAfterMutation: this._returnAfterMutation,
      single: this._isSingle,
      maybeSingle: this._isMaybeSingle,
    };
    try {
      const res = await fetch('/api/db', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(body),
      });
      return res.json();
    } catch (err) {
      return { data: null, error: { message: String(err) } };
    }
  }
}

function _createClientInstance() {
  return {
    auth: {
      async signInWithPassword({
        email,
        password,
      }: {
        email: string;
        password: string;
      }) {
        const res = await fetch('/api/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ email, password }),
        });
        const data = await res.json();
        if (!res.ok) {
          return {
            data: { user: null, session: null },
            error: { message: data.error ?? 'Login failed' },
          };
        }
        _cachedSession = data;
        notifyListeners('SIGNED_IN', data.user);
        return {
          data: {
            user: data.user,
            session: {
              user: data.user,
              access_token: 'local',
              refresh_token: 'local',
            },
          },
          error: null,
        };
      },

      async signUp({
        email,
        password,
        options,
      }: {
        email: string;
        password: string;
        options?: { data?: Record<string, unknown> };
      }) {
        const res = await fetch('/api/auth/signup', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            email,
            password,
            full_name: options?.data?.full_name,
          }),
        });
        const data = await res.json();
        if (!res.ok) {
          return {
            data: { user: null, session: null },
            error: { message: data.error ?? 'Signup failed' },
          };
        }
        _cachedSession = { user: data.user, profile: null };
        notifyListeners('SIGNED_IN', data.user);
        return { data: { user: data.user, session: null }, error: null };
      },

      async signOut() {
        await fetch('/api/auth/logout', {
          method: 'POST',
          credentials: 'include',
        });
        _cachedSession = null;
        notifyListeners('SIGNED_OUT', null);
        return { error: null };
      },

      async getSession() {
        if (_cachedSession !== undefined) {
          const user = _cachedSession?.user ?? null;
          const session = user
            ? { user, access_token: 'local', refresh_token: 'local' }
            : null;
          return { data: { session }, error: null };
        }
        const result = await fetchMe();
        _cachedSession = result.user
          ? { user: result.user, profile: result.profile }
          : null;
        const session = result.user
          ? { user: result.user, access_token: 'local', refresh_token: 'local' }
          : null;
        return { data: { session }, error: null };
      },

      async getUser() {
        const {
          data: { session },
        } = await this.getSession();
        return { data: { user: session?.user ?? null }, error: null };
      },

      async resetPasswordForEmail(
        _email: string,
        _opts?: Record<string, unknown>
      ) {
        return {
          data: {},
          error: { message: 'Password reset not supported in local mode' },
        };
      },

      async updateUser(_attrs: Record<string, unknown>) {
        return {
          data: { user: null },
          error: { message: 'updateUser not supported in local mode' },
        };
      },

      onAuthStateChange(callback: AuthStateCallback) {
        _authListeners.push(callback);
        this.getSession().then(({ data: { session } }) => {
          const event: AuthStateEvent = session ? 'SIGNED_IN' : 'SIGNED_OUT';
          callback(event, session);
        });
        const sub = {
          unsubscribe: () => {
            _authListeners = _authListeners.filter((cb) => cb !== callback);
          },
        };
        return { data: { subscription: sub } };
      },
    },

    from(table: string) {
      return new BrowserQueryBuilder(table);
    },

    channel(_name: string) {
      // Fluent builder stub — .on() must return an object that itself has
      // .on() AND .subscribe(), so callers can chain N event listeners
      // before calling .subscribe() once at the end. The old stub returned
      // a plain { subscribe } object from .on(), so the second .on() call
      // threw "not a function".
      type ChannelStub = {
        on: (...args: unknown[]) => ChannelStub;
        subscribe: (cb?: (status: string) => void) => { unsubscribe: () => void };
      };
      const stub: ChannelStub = {
        on: () => stub,
        subscribe: (_cb?: (status: string) => void) => ({ unsubscribe: () => {} }),
      };
      return stub;
    },

    removeChannel(_ch: unknown) {},
  };
}

// Singleton — same object on every call so hook deps don't change each render
let _instance: ReturnType<typeof _createClientInstance> | null = null;

export function createClient() {
  if (!_instance) _instance = _createClientInstance();
  return _instance;
}
