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

/**
 * Wrapper de fetch qui ajoute automatiquement le header X-Active-Org-Id.
 * Interface strictement compatible avec fetch() natif.
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

  return fetch(input, { ...init, headers })
}
