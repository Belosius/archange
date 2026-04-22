import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import { supabaseAdmin } from '@/lib/supabase'
import { setupGmailWatch } from '@/lib/gmail'

// ─── GET — statut du watch Gmail ─────────────────────────────────────────────
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Non connecte' }, { status: 401 })

  const { data } = await supabaseAdmin
    .from('user_settings')
    .select('watch_expiry, last_history_id')
    .eq('user_id', session.user.id)
    .single()

  const now = Date.now()
  const expiry = data?.watch_expiry ? new Date(data.watch_expiry).getTime() : 0
  const active = expiry > now + 24 * 60 * 60 * 1000

  return NextResponse.json({
    active,
    expiry: data?.watch_expiry || null,
    historyId: data?.last_history_id || null,
  })
}

// ─── POST — configurer ou renouveler le watch Gmail ───────────────────────────
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Non connecte' }, { status: 401 })

  try {
    // setupGmailWatch gere lui-meme le upsert dans user_settings
    await setupGmailWatch(session.user.id)

    // Relire pour retourner le statut mis a jour
    const { data } = await supabaseAdmin
      .from('user_settings')
      .select('watch_expiry, last_history_id')
      .eq('user_id', session.user.id)
      .single()

    return NextResponse.json({ ok: true, expiry: data?.watch_expiry, historyId: data?.last_history_id })
  } catch (e: any) {
    if (e.message === 'GMAIL_AUTH_EXPIRED') {
      return NextResponse.json({ error: 'GMAIL_AUTH_EXPIRED' }, { status: 401 })
    }
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}