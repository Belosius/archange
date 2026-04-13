'use client'
import { useState } from 'react'
import { AppLayout } from '@/components/layout/AppLayout'
import { useEmails } from '@/hooks/useEmails'
import type { Email } from '@/types'

const MAIL_CATS = [
  { id: 'all',      icon: '📬', label: 'Tous'     },
  { id: 'nonlus',   icon: '🔵', label: 'Non lus'  },
  { id: 'atraiter', icon: '📋', label: 'À traiter' },
  { id: 'star',     icon: '⭐', label: 'Favoris'   },
  { id: 'flag',     icon: '🚩', label: 'Flaggés'   },
]

const inp: React.CSSProperties = {
  width: '100%', padding: '8px 12px', borderRadius: 8,
  border: '1px solid #C8C0B4', background: '#F5F3EF',
  fontSize: 13, color: '#1C1814', fontFamily: "'DM Sans', sans-serif",
  outline: 'none', resize: 'none' as const,
}

export default function MailsPage() {
  const [filter, setFilter] = useState('all')
  const [search, setSearch] = useState('')
  const [sel, setSel] = useState<Email | null>(null)
  const [reply, setReply] = useState('')
  const [generating, setGenerating] = useState(false)
  const [subCollapsed, setSubCollapsed] = useState(false)

  const { emails, loading, lastSync, unreadCount, markAsRead, toggleFlag, syncNow } = useEmails(filter, search)

  const initials = (name: string) => name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()

  const avatarColor = (email: string) => {
    const colors = [
      ['#EFF6FF','#1D4ED8'], ['#FDF4FF','#7E22CE'], ['#D1FAE5','#065F46'],
      ['#FEE2E2','#991B1B'], ['#FAEEDA','#854F0B'], ['#E1F5EE','#085041'],
    ]
    const idx = email.charCodeAt(0) % colors.length
    return colors[idx]
  }

  const handleSelect = async (email: Email) => {
    setSel(email)
    setReply('')
    if (email.is_unread) await markAsRead(email.id)
  }

  const generateReply = async () => {
    if (!sel) return
    setGenerating(true)
    try {
      const res = await fetch('/api/claude', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'generate_response', emailBody: sel.body }),
      })
      const { response } = await res.json()
      setReply(response)
    } finally { setGenerating(false) }
  }

  const sendEmail = async () => {
    if (!sel || !reply) return
    // Appel Gmail API via route Next.js
    await fetch('/api/gmail/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ to: sel.from_email, subject: `Re: ${sel.subject}`, body: reply }),
    })
    alert('Email envoyé !')
    setReply('')
  }

  const syncTime = lastSync
    ? `Sync : ${lastSync.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}`
    : 'Synchronisation…'

  return (
    <AppLayout badges={{ '/mails': unreadCount }}>
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>

        {/* ── Sidebar catégories ── */}
        <div style={{ width: subCollapsed ? 44 : 160, background: '#221E19', display: 'flex', flexDirection: 'column', flexShrink: 0, transition: 'width .2s ease', overflow: 'hidden' }}>
          <div style={{ padding: subCollapsed ? '10px 6px' : '12px 10px', display: 'flex', alignItems: 'center', justifyContent: subCollapsed ? 'center' : 'space-between', flexShrink: 0 }}>
            {!subCollapsed && (
              <button onClick={syncNow} style={{ background: '#C9A96E', border: 'none', color: '#1C1814', fontSize: 10, fontWeight: 600, padding: '6px 8px', borderRadius: 6, cursor: 'pointer', flex: 1, marginRight: 6 }}>
                ↺ Sync
              </button>
            )}
            <button onClick={() => setSubCollapsed(v => !v)} style={{ width: 22, height: 22, borderRadius: 5, border: 'none', background: 'rgba(209,196,178,.07)', color: 'rgba(209,196,178,.35)', cursor: 'pointer', fontSize: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              {subCollapsed ? '›' : '‹'}
            </button>
          </div>
          <div style={{ padding: '4px 6px', flex: 1 }}>
            {MAIL_CATS.map(c => (
              <button key={c.id} onClick={() => setFilter(c.id)}
                style={{ display: 'flex', alignItems: 'center', gap: 7, width: '100%', padding: subCollapsed ? '9px 0' : '8px 10px', justifyContent: subCollapsed ? 'center' : 'flex-start', borderRadius: 7, border: 'none', background: filter === c.id ? 'rgba(209,196,178,.1)' : 'transparent', color: filter === c.id ? '#D1C4B2' : 'rgba(209,196,178,.4)', fontSize: 11, cursor: 'pointer', marginBottom: 2 }}
                title={subCollapsed ? c.label : undefined}>
                <span style={{ fontSize: 13 }}>{c.icon}</span>
                {!subCollapsed && <span style={{ flex: 1, textAlign: 'left' }}>{c.label}</span>}
              </button>
            ))}
          </div>
          {!subCollapsed && (
            <div style={{ padding: '8px 10px 12px', fontSize: 10, color: 'rgba(209,196,178,.25)', textAlign: 'center' }}>
              {syncTime}
            </div>
          )}
        </div>

        {/* ── Liste emails ── */}
        <div style={{ width: 280, borderRight: '1px solid #EAE6E1', background: '#FFFFFF', display: 'flex', flexDirection: 'column', flexShrink: 0 }}>
          <div style={{ padding: '14px 14px 10px', borderBottom: '1px solid #EAE6E1', flexShrink: 0 }}>
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Rechercher…" style={{ ...inp, background: '#F7F5F1', border: '1px solid #EAE6E1', fontSize: 12 }}/>
          </div>
          <div style={{ flex: 1, overflowY: 'auto' }}>
            {loading ? (
              <div style={{ padding: 32, textAlign: 'center', color: '#8A8178', fontSize: 12 }}>Chargement…</div>
            ) : emails.length === 0 ? (
              <div style={{ padding: 32, textAlign: 'center', color: '#8A8178', fontSize: 12 }}>Aucun email</div>
            ) : emails.map(em => {
              const [bg, color] = avatarColor(em.from_email)
              return (
                <div key={em.id} onClick={() => handleSelect(em)}
                  style={{ display: 'flex', gap: 9, padding: '11px 12px', borderBottom: '1px solid #EAE6E1', cursor: 'pointer', background: sel?.id === em.id ? '#F5F3EF' : 'transparent', borderLeft: sel?.id === em.id ? '3px solid #C9A96E' : em.is_unread ? '3px solid #7BA8C4' : '3px solid transparent', position: 'relative' }}>
                  <div style={{ position: 'relative', flexShrink: 0 }}>
                    <div style={{ width: 34, height: 34, borderRadius: '50%', background: bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, color }}>{initials(em.from_name)}</div>
                    {em.is_unread && <div style={{ position: 'absolute', top: 0, right: 0, width: 8, height: 8, borderRadius: '50%', background: '#6D9BE8', border: '2px solid #fff' }}/>}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
                      <span style={{ fontSize: 12, fontWeight: em.is_unread ? 700 : 600, color: em.is_unread ? '#6D9BE8' : '#1C1814', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 130 }}>{em.from_name}</span>
                      <span style={{ fontSize: 10, color: '#8A8178', flexShrink: 0 }}>{em.date}</span>
                    </div>
                    <div style={{ fontSize: 11, color: '#5C564F', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginBottom: 2 }}>{em.subject}</div>
                    <div style={{ fontSize: 10, color: '#8A8178', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{em.snippet}</div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* ── Détail email ── */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: '#FDFCFA' }}>
          {!sel ? (
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#8A8178', fontSize: 13, fontStyle: 'italic' }}>
              Sélectionnez un email
            </div>
          ) : (
            <>
              <div style={{ padding: '16px 20px 12px', borderBottom: '1px solid #EAE6E1', flexShrink: 0 }}>
                <div style={{ fontSize: 15, fontWeight: 600, color: '#1C1814', marginBottom: 8 }}>{sel.subject}</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  {(() => { const [bg, color] = avatarColor(sel.from_email); return <div style={{ width: 32, height: 32, borderRadius: '50%', background: bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, color, flexShrink: 0 }}>{initials(sel.from_name)}</div> })()}
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 500, color: '#1C1814' }}>{sel.from_name}</div>
                    <div style={{ fontSize: 11, color: '#8A8178' }}>{sel.from_email}</div>
                  </div>
                  <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
                    {['star','flag'].map(f => (
                      <button key={f} onClick={() => toggleFlag(sel.id, f)}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 16, opacity: sel.flags.includes(f) ? 1 : 0.3 }}>
                        {f === 'star' ? '⭐' : '🚩'}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
              <div style={{ flex: 1, overflowY: 'auto', padding: 20, fontSize: 13, color: '#3D3530', lineHeight: 1.75, whiteSpace: 'pre-wrap' }}>
                {sel.body}
              </div>
              <div style={{ padding: '14px 20px', borderTop: '1px solid #EAE6E1', display: 'flex', flexDirection: 'column', gap: 10, flexShrink: 0 }}>
                {reply ? (
                  <div style={{ background: '#F5F3EF', borderRadius: 10, border: '1px solid #EAE6E1', padding: '12px 14px' }}>
                    <div style={{ fontSize: 10, color: '#8A8178', fontWeight: 700, letterSpacing: '.1em', textTransform: 'uppercase', marginBottom: 8 }}>✨ Réponse ARCHANGE</div>
                    <textarea value={reply} onChange={e => setReply(e.target.value)} rows={6} style={{ ...inp, background: 'transparent', border: 'none', padding: 0 }}/>
                  </div>
                ) : null}
                <div style={{ display: 'flex', gap: 8 }}>
                  <button onClick={generateReply} disabled={generating} style={{ flex: 1, padding: '9px', borderRadius: 8, border: 'none', background: '#1C1814', color: '#C9A96E', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                    {generating ? '⟳ Génération…' : reply ? '↻ Regénérer' : '✨ Réponse IA'}
                  </button>
                  {reply && <button onClick={sendEmail} style={{ flex: 1, padding: '9px', borderRadius: 8, border: 'none', background: '#C9A96E', color: '#1C1814', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>📤 Envoyer</button>}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </AppLayout>
  )
}
