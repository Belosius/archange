import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import { downloadAttachment } from '@/lib/gmail'

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Non connecte' }, { status: 401 })
  const { searchParams } = req.nextUrl
  const gmailId = searchParams.get('gmailId')
  const attachmentId = searchParams.get('attachmentId')
  const filename = searchParams.get('filename') || 'attachment'
  if (!gmailId || !attachmentId) return NextResponse.json({ error: 'Params manquants' }, { status: 400 })
  try {
    const base64Data = await downloadAttachment(session.user.id, gmailId, attachmentId)
    if (!base64Data) return NextResponse.json({ error: 'Introuvable' }, { status: 404 })
    const buffer = Buffer.from(base64Data.replace(/-/g, '+').replace(/_/g, '/'), 'base64')
    return new NextResponse(buffer, {
      headers: {
        'Content-Disposition': 'attachment; filename="' + filename + '"',
        'Content-Type': 'application/octet-stream',
        'Content-Length': String(buffer.length),
      }
    })
  } catch (e: any) {
    if (e.message === 'GMAIL_AUTH_EXPIRED') return NextResponse.json({ error: 'GMAIL_AUTH_EXPIRED' }, { status: 401 })
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}