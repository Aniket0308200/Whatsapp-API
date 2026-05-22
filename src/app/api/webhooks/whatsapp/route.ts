import { NextRequest, NextResponse } from 'next/server'

/**
 * GET /api/webhooks/whatsapp
 *
 * Meta webhook verification handshake.
 * Meta sends three query params:
 *   hub.mode         — always "subscribe"
 *   hub.verify_token — the token you entered in the Meta dashboard
 *   hub.challenge    — a random number Meta wants echoed back as plain text
 *
 * If the verify token matches, echo hub.challenge with 200.
 * Otherwise return 403 so Meta knows verification failed.
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)

    const mode      = searchParams.get('hub.mode')
    const token     = searchParams.get('hub.verify_token')
    const challenge = searchParams.get('hub.challenge')

    console.log('[Webhook] GET verification request received')
    console.log('[Webhook] hub.mode      :', mode)
    console.log('[Webhook] hub.verify_token:', token)
    console.log('[Webhook] hub.challenge :', challenge)

    // All three params are required
    if (!mode || !token || !challenge) {
      console.warn('[Webhook] Missing required query parameters')
      return NextResponse.json(
        { error: 'Missing hub.mode, hub.verify_token, or hub.challenge' },
        { status: 400 }
      )
    }

    // Only "subscribe" mode is valid for webhook registration
    if (mode !== 'subscribe') {
      console.warn('[Webhook] Invalid hub.mode:', mode)
      return NextResponse.json(
        { error: 'Invalid hub.mode' },
        { status: 400 }
      )
    }

    const verifyToken = process.env.WHATSAPP_VERIFY_TOKEN

    if (!verifyToken) {
      console.error('[Webhook] WHATSAPP_VERIFY_TOKEN is not set in environment')
      return NextResponse.json(
        { error: 'Server misconfiguration' },
        { status: 500 }
      )
    }

    // Token must match exactly
    if (token !== verifyToken) {
      console.warn('[Webhook] Token mismatch — expected:', verifyToken, '| received:', token)
      return new NextResponse('Forbidden: token mismatch', { status: 403 })
    }

    // Success — echo the challenge as plain text (Meta requires this exact format)
    console.log('[Webhook] ✅ Verification successful, returning challenge:', challenge)
    return new NextResponse(challenge, {
      status: 200,
      headers: { 'Content-Type': 'text/plain' },
    })
  } catch (error) {
    console.error('[Webhook] GET error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

/**
 * POST /api/webhooks/whatsapp
 *
 * Receives incoming WhatsApp events from Meta (messages, status updates, etc.)
 * Meta expects a 200 response within 20 seconds — heavy processing should
 * be done asynchronously after the ack.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()

    console.log('[Webhook] POST payload received:')
    console.log(JSON.stringify(body, null, 2))

    // Extract and log message details if present
    const entries = body?.entry ?? []
    for (const entry of entries) {
      for (const change of entry?.changes ?? []) {
        const value = change?.value

        // Incoming messages
        if (value?.messages?.length) {
          for (const msg of value.messages) {
            console.log('[Webhook] Incoming message from:', msg.from)
            console.log('[Webhook] Message type:', msg.type)
            if (msg.type === 'text') {
              console.log('[Webhook] Message text:', msg.text?.body)
            }
          }
        }

        // Status updates (sent / delivered / read / failed)
        if (value?.statuses?.length) {
          for (const status of value.statuses) {
            console.log('[Webhook] Status update — id:', status.id, '| status:', status.status)
          }
        }
      }
    }

    // Always ack 200 immediately so Meta doesn't retry
    return NextResponse.json({ status: 'received' }, { status: 200 })
  } catch (error) {
    console.error('[Webhook] POST error:', error)
    // Still return 200 to prevent Meta from flooding retries
    return NextResponse.json({ status: 'error logged' }, { status: 200 })
  }
}
