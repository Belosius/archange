import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import { getGmailClient } from '@/lib/gmail'

// POST /api/gmail/draft — créer ou mettre à jour un brouillon Gmail
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Non connecté' }, { status: 401 })

  const { to, subject, body, draftId } = await req.json()
  if (!to || !subject) return NextResponse.json({ error: 'to et subject requis' }, { status: 400 })

  try {
    const gmail = await getGmailClient(session.user.id)

    // Encoder le message en base64 RFC 2822
    const message = [
      `To: ${to}`,
      `Subject: ${subject}`,
      'Content-Type: text/plain; charset=utf-8',
      '',
      body || '',
    ].join('\r\n')

    const encoded = Buffer.from(message).toString('base64')
      .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')

    let result: any

    if (draftId) {
      // Mettre à jour un brouillon existant
      result = await gmail.users.drafts.update({
        userId: 'me',
        id: draftId,
        requestBody: { message: { raw: encoded } },
      })
    } else {
      // Créer un nouveau brouillon
      result = await gmail.users.drafts.create({
        userId: 'me',
        requestBody: { message: { raw: encoded } },
      })
    }

    return NextResponse.json({ draftId: result.data.id })
  } catch (err: any) {
    if (err?.message === 'GMAIL_AUTH_EXPIRED') {
      return NextResponse.json({ error: 'GMAIL_AUTH_EXPIRED' }, { status: 401 })
    }
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
