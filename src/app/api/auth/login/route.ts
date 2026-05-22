import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { getDb } from '@/lib/db'
import { signToken, COOKIE_NAME, COOKIE_OPTIONS } from '@/lib/auth/jwt'

export async function POST(req: NextRequest) {
  try {
    const { email, password } = await req.json()

    if (!email || !password) {
      return NextResponse.json({ error: 'Email and password required' }, { status: 400 })
    }

    const db = getDb()
    const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email.toLowerCase().trim()) as
      | { id: string; email: string; password_hash: string; full_name: string | null }
      | undefined

    if (!user) {
      return NextResponse.json({ error: 'Invalid login credentials' }, { status: 401 })
    }

    const valid = await bcrypt.compare(password, user.password_hash)
    if (!valid) {
      return NextResponse.json({ error: 'Invalid login credentials' }, { status: 401 })
    }

    const token = signToken({ userId: user.id, email: user.email })
    const profile = db
      .prepare('SELECT id, full_name, email, avatar_url, role FROM profiles WHERE user_id = ?')
      .get(user.id) as { id: string; full_name: string; email: string; avatar_url: string | null; role: string } | undefined

    const res = NextResponse.json({
      user: {
        id: user.id,
        email: user.email,
        user_metadata: { full_name: user.full_name },
      },
      profile: profile ?? null,
    })

    res.cookies.set(COOKIE_NAME, token, COOKIE_OPTIONS)
    return res
  } catch (err) {
    console.error('[auth/login]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
