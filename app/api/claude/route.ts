import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import Anthropic from '@anthropic-ai/sdk'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Non connecté' }, { status: 401 })

  const { action, msg, system, docs, ...payload } = await req.json()

  try {
    // Action raw : appel direct Claude avec msg + system + docs
    if (action === 'raw') {
      const content: any[] = []
      if (docs) {
        for (const d of docs) {
          if (d.isPdf && d.base64) content.push({ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: d.base64 }, title: d.name })
          else if (d.content) content.push({ type: 'text', text: '=== ' + d.name + ' ===\n' + d.content })
        }
      }
      content.push({ type: 'text', text: msg })
      const res = await anthropic.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1024,
        system: system || 'Tu es un assistant utile.',
        messages: [{ role: 'user', content }]
      })
      const response = res.content.filter((b: any) => b.type === 'text').map((b: any) => b.text).join('')
      return NextResponse.json({ response })
    }

    return NextResponse.json({ error: 'Action inconnue' }, { status: 400 })
  } catch (error: any) {
    console.error('Claude API error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
