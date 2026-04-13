import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import Anthropic from '@anthropic-ai/sdk'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

const MODELS = [
  'claude-sonnet-4-20250514',
  'claude-haiku-4-5-20251001',
]

async function callWithRetry(params: any, retries = 2): Promise<string> {
  for (const model of MODELS) {
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const res = await anthropic.messages.create({ ...params, model })
        return res.content.filter((b: any) => b.type === 'text').map((b: any) => b.text).join('')
      } catch (e: any) {
        const isOverload = e?.status === 529 || e?.message?.includes('overloaded')
        if (!isOverload) throw e
        if (attempt < retries) await new Promise(r => setTimeout(r, 1000 * (attempt + 1)))
      }
    }
  }
  throw new Error('Tous les modèles sont surchargés, réessayez dans quelques instants.')
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Non connecté' }, { status: 401 })

  const { action, msg, system, docs } = await req.json()

  try {
    if (action === 'raw') {
      const content: any[] = []
      if (docs) {
        for (const d of docs) {
          if (d.isPdf && d.base64) {
            content.push({ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: d.base64 }, title: d.name })
          } else if (d.content) {
            content.push({ type: 'text', text: '=== ' + d.name + ' ===\n' + d.content })
          }
        }
      }
      content.push({ type: 'text', text: msg })

      const response = await callWithRetry({
        max_tokens: 1024,
        system: system || 'Tu es un assistant utile.',
        messages: [{ role: 'user', content }]
      })

      return NextResponse.json({ response })
    }

    return NextResponse.json({ error: 'Action inconnue' }, { status: 400 })
  } catch (error: any) {
    console.error('Claude API error:', error?.message)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
