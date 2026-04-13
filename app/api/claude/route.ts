import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import Anthropic from '@anthropic-ai/sdk'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

async function callWithRetry(params: any, retries = 2): Promise<any> {
  const models = ['claude-sonnet-4-20250514', 'claude-haiku-4-5-20251001']
  let lastError: any
  for (const model of models) {
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const res = await anthropic.messages.create({ ...params, model })
        return res
      } catch (e: any) {
        lastError = e
        const isOverloaded = e?.status === 529 || e?.message?.includes('overloaded')
        if (!isOverloaded) throw e
        if (attempt < retries) await new Promise(r => setTimeout(r, 1000 * (attempt + 1)))
      }
    }
  }
  throw lastError
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
          if (d.isPdf && d.base64) content.push({ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: d.base64 }, title: d.name })
          else if (d.content) content.push({ type: 'text', text: '=== ' + d.name + ' ===\n' + d.content })
        }
      }
      content.push({ type: 'text', text: msg })

      const res = await callWithRetry({
        max_tokens: 1024,
        system: system || 'Tu es un assistant utile.',
        messages: [{ role: 'user', content }]
      })

      const response = res.content
        .filter((b: any) => b.type === 'text')
        .map((b: any) => b.text)
        .join('')
      return NextResponse.json({ response })
    }

    return NextResponse.json({ error: 'Action inconnue' }, { status: 400 })
  } catch (error: any) {
    console.error('Claude API error:', error?.message || error)
    return NextResponse.json({ error: error?.message || 'Erreur serveur' }, { status: 500 })
  }
}
