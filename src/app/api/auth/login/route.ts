import { NextRequest, NextResponse } from 'next/server'
import { signToken, COOKIE_NAME, COOKIE_OPTIONS } from '@/lib/auth/jwt'

export async function POST(req: NextRequest) {
  try {
    const token = signToken({ userId: 'dev-user-id', email: 'developer@wacrm.local' })
    const res = NextResponse.json({
      user: {
        id: 'dev-user-id',
        email: 'developer@wacrm.local',
        user_metadata: { full_name: 'Developer Mode' },
      },
      profile: {
        id: 'dev-profile-id',
        user_id: 'dev-user-id',
        full_name: 'Developer Mode',
        email: 'developer@wacrm.local',
        avatar_url: null,
        role: 'admin',
      },
    })

    res.cookies.set(COOKIE_NAME, token, COOKIE_OPTIONS)
    return res
  } catch (err) {
    console.error('[auth/login]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
