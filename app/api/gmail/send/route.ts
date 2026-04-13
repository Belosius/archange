import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import { getGmailClient } from '@/lib/gmail'
export async function POST(request: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({error:'Non autorisé'},{status:401})
  const {to,subject,body,threadId} = await request.json()
  try {
    const gmail = await getGmailClient(session.user.id)
    const raw = Buffer.from(`To: ${to}
Subject: ${subject}
Content-Type: text/plain; charset=utf-8

${body}`).toString('base64url')
    await gmail.users.messages.send({userId:'me',requestBody:{raw,threadId}})
    return NextResponse.json({success:true})
  } catch(e:any) { return NextResponse.json({error:e.message},{status:500}) }
}
