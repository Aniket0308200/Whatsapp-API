import { NextRequest, NextResponse } from 'next/server'
import { verifyToken, COOKIE_NAME } from '@/lib/auth/jwt'
import { getDb } from '@/lib/db'

export async function GET(req: NextRequest) {
  return NextResponse.json({
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
}
