'use client'
/**
 * ═══════════════════════════════════════════════════════════════
 *  lib/api-fetch.ts — Wrapper fetch multi-tenant (client-side)
 * ═══════════════════════════════════════════════════════════════
 *
 * Ajoute automatiquement le header `X-Active-Org-Id` à tout appel
 * vers /api/*. Le backend (getOrgContext) utilise ce header pour
 * résoudre l'organisation active de la requête.
 *
 * Phase D bonus : si une réponse contient { error: 'GMAIL_AUTH_EXPIRED' },
 * redirection automatique vers /api/gmail/connect pour relancer le flow
 * OAuth, en gardant l'URL actuelle comme retour.
 *
 * Usage (drop-in replacement pour fetch) :
 *
 *   import { apiFetch } from '@/lib/api-fetch'
 *   const r = await apiFetch('/api/events')
 *   const r = await apiFetch('/api/events', { method: 'POST', body: JSON.stringify({...}) })
 *
 * Le header JSON Content-Type est AJOUTÉ automatiquement pour les
 * requêtes POST/PATCH/PUT avec un body de type string.
 */

import { getSession } from 'next-auth/react'

type ApiFetchInput = string | URL | Request

/**
 * Cache de l'activeOrgId pour éviter de faire tourner getSession() à chaque appel.
 * Rafraîchi automatiquement toutes les 60 secondes ou sur demande explicite.
 */
let cachedOrgId: string | null = null
let cachedAt = 0
const CACHE_TTL = 60_000 // 60s

async function getActiveOrgId(): Promise<string | null> {
  const now = Date.now()
  if (cachedOrgId && now - cachedAt < CACHE_TTL) return cachedOrgId
  const session = await getSession()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  cachedOrgId = (session?.user as any)?.activeOrgId || null
  cachedAt = now
  return cachedOrgId
}

/**
 * Invalide le cache de l'org active. À appeler après un switch d'organisation.
 */
export function invalidateActiveOrgCache() {
  cachedOrgId = null
  cachedAt = 0
}

// ─── Anti-redirect-loop : évite de redéclencher /api/gmail/connect en boucle ──
// Si l'utilisateur vient de revenir du callback Gmail et que ça plante encore,
// on n'essaie qu'une fois par session.
let gmailRedirectAttempted = false

/**
 * Wrapper de fetch qui ajoute automatiquement le header X-Active-Org-Id.
 * Interface strictement compatible avec fetch() natif.
 *
 * Détecte aussi les erreurs GMAIL_AUTH_EXPIRED et redirige vers le flow OAuth.
 */
export async function apiFetch(
  input: ApiFetchInput,
  init?: RequestInit
): Promise<Response> {
  const orgId = await getActiveOrgId()

  const headers = new Headers(init?.headers)
  if (orgId) headers.set('X-Active-Org-Id', orgId)

  // Ajout automatique du Content-Type pour les bodies JSON (pattern courant)
  if (init?.body && typeof init.body === 'string' && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }

  const response = await fetch(input, { ...init, headers })

  // Phase D : intercepter GMAIL_AUTH_EXPIRED et déclencher la reconnexion auto
  // On clone la response pour pouvoir la lire sans la consommer pour le caller
  if (!response.ok && !gmailRedirectAttempted) {
    const cloned = response.clone()
    try {
      const data = await cloned.json()
      if (data?.error === 'GMAIL_AUTH_EXPIRED' || data?.code === 'GMAIL_AUTH_EXPIRED') {
        gmailRedirectAttempted = true
        // Garder l'URL actuelle comme cible de retour après reconnexion
        const returnTo = window.location.pathname + window.location.search
        const connectUrl = `/api/gmail/connect?return=${encodeURIComponent(returnTo)}`
        // Petit toast natif avant de rediriger
        if (typeof window !== 'undefined') {
          console.warn('[apiFetch] Gmail token expired, redirecting to OAuth...')
        }
        window.location.href = connectUrl
        // Pendant la redirection, on retourne quand même la réponse au caller
        // (qui ne devrait pas y arriver puisque la page se recharge)
      }
    } catch {
      // Pas un JSON, pas un GMAIL_AUTH_EXPIRED, on laisse passer
    }
  }

  return response
}
