import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { syncFromHistory } from '@/lib/gmail'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const token = req.nextUrl.searchParams.get('token')
    if (process.env.GMAIL_WEBHOOK_TOKEN && token !== process.env.GMAIL_WEBHOOK_TOKEN) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    const messageData = body?.message?.data
    if (!messageData) return NextResponse.json({ error: 'No data' }, { status: 400 })
    const decoded = Buffer.from(messageData, 'base64').toString('utf-8')
    const { emailAddress, historyId } = JSON.parse(decoded)
    if (!emailAddress || !historyId) return NextResponse.json({ error: 'Invalid payload' }, { status: 400 })
    const { data: user } = await supabaseAdmin.auth.admin.listUsers()
    const matchedUser = user?.users?.find(u => u.email === emailAddress)
    const { data: account } = await supabaseAdmin.from('accounts').select('user_id').limit(1).single()
    const userId = matchedUser?.id || account?.user_id
    if (!userId) return NextResponse.json({ error: 'User not found' }, { status: 404 })
    const { data: settings } = await supabaseAdmin.from('user_settings').select('last_history_id').eq('user_id', userId).single()
    const startHistoryId = String(settings?.last_history_id || historyId)
    await syncFromHistory(userId, startHistoryId)
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    console.error('Webhook error:', e.message)
    return NextResponse.json({ error: String(e) })
  }
}