'use client'
import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { useSession } from 'next-auth/react'
import type { Evenement } from '@/types'

export function useEvents() {
  const { data: session } = useSession()
  const [events, setEvents] = useState<Evenement[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    if (!session) return
    const res = await fetch('/api/events')
    const data = await res.json()
    setEvents(data)
    setLoading(false)
  }, [session])

  useEffect(() => { load() }, [load])

  // Realtime Supabase — nouvel événement créé automatiquement par le webhook
  useEffect(() => {
    if (!session?.user?.id) return
    const channel = supabase
      .channel('events-realtime')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'evenements',
        filter: `user_id=eq.${session.user.id}`,
      }, () => { load() })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [session?.user?.id, load])

  const create = async (data: Partial<Evenement>) => {
    const res = await fetch('/api/events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })
    const created = await res.json()
    setEvents(prev => [created, ...prev])
    return created
  }

  const update = async (id: string, data: Partial<Evenement>) => {
    const res = await fetch(`/api/events/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })
    const updated = await res.json()
    setEvents(prev => prev.map(e => e.id === id ? updated : e))
    return updated
  }

  const remove = async (id: string) => {
    await fetch(`/api/events/${id}`, { method: 'DELETE' })
    setEvents(prev => prev.filter(e => e.id !== id))
  }

  const generateNoteIA = async (evenementId: string): Promise<string> => {
    const res = await fetch('/api/claude', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'generate_note_ia', evenementId }),
    })
    const { note } = await res.json()
    setEvents(prev => prev.map(e => e.id === evenementId
      ? { ...e, note_ia: note, note_ia_date: new Date().toLocaleDateString('fr-FR') }
      : e
    ))
    return note
  }

  return { events, loading, create, update, remove, generateNoteIA, refresh: load }
}
