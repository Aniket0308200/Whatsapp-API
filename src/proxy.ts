import { NextResponse, type NextRequest } from 'next/server'

const COOKIE_NAME = 'auth-token'

// Edge-compatible JWT payload check — decodes without verifying signature.
// Full signature verification happens in Node.js API routes and server shim.
// Acceptable here because unauthenticated users only get 307; all API calls
// still require full JWT verification on the server side.
function parseJwtPayload(token: string): { userId: string; exp?: number } | null {
  try {
    const parts = token.split('.')
    if (parts.length !== 3) return null
    const b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/')
    const payload = JSON.parse(atob(b64))
    if (payload.exp && Date.now() / 1000 > payload.exp) return null
    if (!payload.userId) return null
    return payload
  } catch {
    return null
  }
}

export function proxy(request: NextRequest) {
  const token = request.cookies.get(COOKIE_NAME)?.value
  const user = token ? parseJwtPayload(token) : null

  const { pathname } = request.nextUrl

  // Auth pages — redirect to dashboard if already logged in
  if (user && (pathname === '/login' || pathname === '/signup' || pathname === '/forgot-password')) {
    const url = request.nextUrl.clone()
    url.pathname = '/dashboard'
    return NextResponse.redirect(url)
  }

  // Protected pages — redirect to login if not authenticated
  const protectedPaths = ['/dashboard', '/inbox', '/contacts', '/pipelines', '/broadcasts', '/automations', '/settings']
  if (!user && protectedPaths.some(p => pathname.startsWith(p))) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    return NextResponse.redirect(url)
  }

  // API routes that need auth (not webhooks, not our own auth/db routes)
  if (
    !user &&
    pathname.startsWith('/api/whatsapp/') &&
    !pathname.includes('/webhook')
  ) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  return NextResponse.next()
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
