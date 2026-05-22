import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { randomUUID } from 'crypto'
import { getDb } from '@/lib/db'
import { signToken, COOKIE_NAME, COOKIE_OPTIONS } from '@/lib/auth/jwt'

export async function POST(req: NextRequest) {
  try {
    const { email, password, full_name } = await req.json()

    if (!email || !password) {
      return NextResponse.json({ error: 'Email and password required' }, { status: 400 })
    }

    if (password.length < 6) {
      return NextResponse.json({ error: 'Password must be at least 6 characters' }, { status: 400 })
    }

    const db = getDb()
    const normalizedEmail = email.toLowerCase().trim()

    const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(normalizedEmail)
    if (existing) {
      return NextResponse.json({ error: 'User already registered' }, { status: 409 })
    }

    const passwordHash = await bcrypt.hash(password, 10)
    const userId = randomUUID()
    const profileId = randomUUID()

    db.prepare(
      'INSERT INTO users (id, email, password_hash, full_name) VALUES (?, ?, ?, ?)'
    ).run(userId, normalizedEmail, passwordHash, full_name ?? '')

    db.prepare(
      'INSERT INTO profiles (id, user_id, full_name, email) VALUES (?, ?, ?, ?)'
    ).run(profileId, userId, full_name ?? '', normalizedEmail)

    const token = signToken({ userId, email: normalizedEmail })

    const res = NextResponse.json({
      user: {
        id: userId,
        email: normalizedEmail,
        user_metadata: { full_name: full_name ?? '' },
      },
    })

    res.cookies.set(COOKIE_NAME, token, COOKIE_OPTIONS)
    return res
  } catch (err) {
    console.error('[auth/signup]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
