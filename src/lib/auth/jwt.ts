import jwt from 'jsonwebtoken'

const SECRET = process.env.JWT_SECRET ?? 'dev-secret-change-in-production'
const EXPIRES = '7d'

export interface JwtPayload {
  userId: string
  email: string
}

export function signToken(payload: JwtPayload): string {
  return jwt.sign(payload, SECRET, { expiresIn: EXPIRES })
}

export function verifyToken(token: string): JwtPayload | null {
  try {
    return jwt.verify(token, SECRET) as JwtPayload
  } catch {
    return null
  }
}

export const COOKIE_NAME = 'auth-token'
export const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  path: '/',
  maxAge: 60 * 60 * 24 * 7, // 7 days in seconds
}
