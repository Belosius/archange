'use client'
import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { useSession } from 'next-auth/react'
import type { Email } from '@/types'

export function useEmails(filter: string = 'all', search: string = '') {
  const { data: session } = useSession()
  const [emails, setEmails] = useState<Email[]>([])
  const [loading, setLoading] = useState(true)
  const [lastSync, setLastSync] = useState<Date | null>(null)

  // Charger les emails depuis l'API
  const load = useCallback(async () => {
    if (!session) return
    const params = new URLSearchParams({ filter, q: search })
    const res = await fetch(`/api/emails?${params}`)
    const data = await res.json()
    setEmails(data)
    setLastSync(new Date())
    setLoading(false)
  }, [session, filter, search])

  useEffect(() => { load() }, [load])

  // ─── Supabase Realtime ─────────────────────────────────────────
  // Dès qu'un email arrive (via webhook Gmail → Supabase),
  // la liste se met à jour AUTOMATIQUEMENT sans recharger la page
  useEffect(() => {
    if (!session?.user?.id) return

    const channel = supabase
      .channel('emails-realtime')
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'emails',
        filter: `user_id=eq.${session.user.id}`,
      }, (payload) => {
        // Nouvel email reçu → l'ajouter en tête de liste
        setEmails(prev => [payload.new as Email, ...prev])
        setLastSync(new Date())
        // Notification sonore optionnelle
        if (typeof window !== 'undefined' && 'Notification' in window) {
          new Notification('ARCHANGE · Nouvel email', {
            body: `${(payload.new as Email).from_name} — ${(payload.new as Email).subject}`,
            icon: '/icon.png',
          })
        }
      })
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'emails',
        filter: `user_id=eq.${session.user.id}`,
      }, (payload) => {
        // Email mis à jour (lu, flaggé, etc.)
        setEmails(prev => prev.map(e => e.id === payload.new.id ? payload.new as Email : e))
      })
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [session?.user?.id])

  // Actions
  const markAsRead = async (id: string) => {
    await fetch(`/api/emails/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ is_unread: false }) })
  }

  const toggleFlag = async (id: string, flag: string) => {
    const email = emails.find(e => e.id === id)
    if (!email) return
    const flags = email.flags.includes(flag)
      ? email.flags.filter(f => f !== flag)
      : [...email.flags, flag]
    await fetch(`/api/emails/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ flags }) })
    setEmails(prev => prev.map(e => e.id === id ? { ...e, flags } : e))
  }

  const syncNow = async () => {
    setLoading(true)
    await fetch('/api/emails', { method: 'POST' })
    await load()
  }

  const unreadCount = emails.filter(e => e.is_unread).length

  return { emails, loading, lastSync, unreadCount, markAsRead, toggleFlag, syncNow, refresh: load }
}
