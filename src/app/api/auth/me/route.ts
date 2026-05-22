import { NextRequest, NextResponse } from 'next/server'
import { verifyToken, COOKIE_NAME } from '@/lib/auth/jwt'
import { getDb } from '@/lib/db'

export async function GET(req: NextRequest) {
  const token = req.cookies.get(COOKIE_NAME)?.value
  if (!token) {
    return NextResponse.json({ user: null, profile: null })
  }

  const payload = verifyToken(token)
  if (!payload) {
    return NextResponse.json({ user: null, profile: null })
  }

  try {
    const db = getDb()
    const user = db.prepare('SELECT id, email, full_name FROM users WHERE id = ?').get(payload.userId) as
      | { id: string; email: string; full_name: string | null }
      | undefined

    if (!user) {
      return NextResponse.json({ user: null, profile: null })
    }

    const profile = db
      .prepare('SELECT id, full_name, email, avatar_url, role FROM profiles WHERE user_id = ?')
      .get(user.id) as
      | { id: string; full_name: string; email: string; avatar_url: string | null; role: string }
      | undefined

    return NextResponse.json({
      user: {
        id: user.id,
        email: user.email,
        user_metadata: { full_name: user.full_name },
      },
      profile: profile ?? null,
    })
  } catch (err) {
    console.error('[auth/me]', err)
    return NextResponse.json({ user: null, profile: null })
  }
}
