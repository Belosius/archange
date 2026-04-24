/**
 * ═══════════════════════════════════════════════════════════════
 *  /api/claude — Proxy vers l'API Anthropic
 * ═══════════════════════════════════════════════════════════════
 *
 * Fait tourner un prompt sur Claude avec retry automatique entre
 * Sonnet 4 (puissant) et Haiku 4.5 (fallback en cas de surcharge).
 *
 * Body attendu : { action: 'raw', msg: string, system?: string, docs?: Array<{...}> }
 * Réponse : { response: string }
 *
 * Multi-tenant : on vérifie simplement que le user est membre de l'org
 * active (pas de filtrage de data à proprement parler, c'est un proxy LLM).
 * On bloque les rôles 'lecture' pour éviter qu'ils consomment des tokens.
 */

import { NextRequest, NextResponse } from 'next/server'
import { getOrgContext } from '@/lib/org/getOrgContext'
import Anthropic from '@anthropic-ai/sdk'

const MODELS = ['claude-sonnet-4-20250514', 'claude-haiku-4-5-20251001']

async function callWithRetry(params: any, retries = 2): Promise<string> {
  for (const model of MODELS) {
    for (let attempt = 0; attempt <= retries; attempt++) {
      const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
      try {
        const res = await anthropic.messages.create({ ...params, model })
        return res.content
          .filter((b: any) => b.type === 'text')
          .map((b: any) => b.text)
          .join('')
      } catch (e: any) {
        const isOverload = e?.status === 529 || e?.message?.includes('overloaded')
        if (!isOverload) throw e
        if (attempt < retries) await new Promise(r => setTimeout(r, 1000 * (attempt + 1)))
      }
    }
  }
  throw new Error('Serveurs surchargés, réessayez dans quelques instants.')
}

export async function POST(req: NextRequest) {
  const ctx = await getOrgContext(req)
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  if (ctx.role === 'lecture') {
    return NextResponse.json(
      { error: 'Forbidden', message: 'Read-only users cannot trigger AI calls' },
      { status: 403 }
    )
  }

  const { action, msg, system, docs } = await req.json()

  try {
    if (action === 'raw') {
      const content: any[] = []
      if (docs) {
        for (const d of docs) {
          if (d.isPdf && d.base64) {
            content.push({
              type: 'document',
              source: { type: 'base64', media_type: 'application/pdf', data: d.base64 },
            })
          } else if (d.content) {
            content.push({ type: 'text', text: '=== ' + d.name + ' ===\n' + d.content })
          }
        }
      }
      content.push({ type: 'text', text: msg })

      const response = await callWithRetry({
        max_tokens: 1024,
        system: system || 'Tu es un assistant professionnel.',
        messages: [{ role: 'user', content }],
      })

      return NextResponse.json({ response })
    }

    return NextResponse.json({ error: 'Action inconnue' }, { status: 400 })
  } catch (error: any) {
    console.error('[claude]', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
