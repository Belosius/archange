import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import { supabaseAdmin } from '@/lib/supabase'
import { setupGmailWatch } from '@/lib/gmail'

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Non connecte' }, { status: 401 })
  if (!process.env.GMAIL_PUBSUB_TOPIC) return NextResponse.json({ warning: 'GMAIL_PUBSUB_TOPIC non configure' })
  try {
    const result = await setupGmailWatch(session.user.id)
    return NextResponse.json({ ok: true, ...result })
  } catch (e: any) {
    if (e.message === 'GMAIL_AUTH_EXPIRED') return NextResponse.json({ error: 'GMAIL_AUTH_EXPIRED' }, { status: 401 })
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Non connecte' }, { status: 401 })
  const { data } = await supabaseAdmin.from('user_settings').select('watch_expiry').eq('user_id', session.user.id).single()
  const expiry = data?.watch_expiry
  const isActive = expiry && new Date(expiry) > new Date()
  return NextResponse.json({ active: !!isActive, expiry: expiry || null })
}