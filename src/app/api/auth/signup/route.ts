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
    })

    res.cookies.set(COOKIE_NAME, token, COOKIE_OPTIONS)
    return res
  } catch (err) {
    console.error('[auth/signup]', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
