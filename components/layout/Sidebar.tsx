'use client'

import { useSession, signOut } from 'next-auth/react'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'

const NAV_ITEMS = [
  { href: '/events',   icon: '◈', label: 'Événements' },
  { href: '/mails',    icon: '⌁', label: 'Mails'      },
  { href: '/planning', icon: '⧖', label: 'Planning'   },
  { href: '/stats',    icon: '◎', label: 'Stats'      },
  { href: '/sources',  icon: '⟡', label: 'Sources IA' },
]

interface Org {
  id: string
  nom: string
  slug: string
  type: string
  role: string
  isActive: boolean
}

interface SidebarProps {
  badges?: Record<string, number>
}

export function Sidebar({ badges = {} }: SidebarProps) {
  const { data: session } = useSession()
  const pathname = usePathname()
  const router = useRouter()
  const [collapsed, setCollapsed] = useState(false)
  const [orgs, setOrgs] = useState<Org[]>([])
  const [orgMenuOpen, setOrgMenuOpen] = useState(false)
  const [switching, setSwitching] = useState(false)
  const orgRef = useRef<HTMLDivElement>(null)

  const initials = session?.user?.name
    ?.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase() || 'OT'

  // Charger les orgs
  useEffect(() => {
    fetch('/api/orgs')
      .then(r => r.ok ? r.json() : Promise.reject())
      .then(data => setOrgs(data.orgs || []))
      .catch(() => {})
  }, [])

  // Fermer le menu quand on clique en dehors
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (orgMenuOpen && orgRef.current && !orgRef.current.contains(e.target as Node)) {
        setOrgMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [orgMenuOpen])

  const activeOrg = orgs.find(o => o.isActive) || orgs[0]
  const canManage = activeOrg?.role === 'super_admin' || activeOrg?.role === 'admin'

  const switchOrg = async (orgId: string) => {
    if (orgId === activeOrg?.id || switching) return
    setSwitching(true)
    try {
      const r = await fetch('/api/orgs/switch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orgId }),
      })
      if (!r.ok) throw new Error('Switch failed')
      window.location.reload()
    } catch {
      alert('Impossible de changer d'organisation')
      setSwitching(false)
    }
  }

  return (
    <aside style={{
      width: collapsed ? 60 : 200,
      background: '#1C1814',
      display: 'flex',
      flexDirection: 'column',
      flexShrink: 0,
      transition: 'width .25s cubic-bezier(.4,0,.2,1)',
      overflow: 'hidden',
    }}>
      {/* Header */}
      <div style={{ padding: collapsed ? '16px 0 12px' : '20px 16px 16px', display: 'flex', alignItems: 'center', justifyContent: collapsed ? 'center' : 'space-between', borderBottom: '1px solid rgba(209,196,178,.06)', flexShrink: 0 }}>
        {!collapsed && (
          <div>
            <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 13, fontWeight: 600, color: 'rgba(209,196,178,.85)', letterSpacing: '.12em' }}>ARCHANGE</div>
            <div style={{ fontSize: 8, color: 'rgba(209,196,178,.3)', letterSpacing: '.18em', textTransform: 'uppercase', marginTop: 3 }}>AGENT IA</div>
          </div>
        )}
        <button onClick={() => setCollapsed(v => !v)} style={{ width: 22, height: 22, borderRadius: 5, border: 'none', background: 'rgba(209,196,178,.07)', color: 'rgba(209,196,178,.35)', cursor: 'pointer', fontSize: 11, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          {collapsed ? '›' : '‹'}
        </button>
      </div>

      {/* Org switcher */}
      {activeOrg && (
        <div ref={orgRef} style={{ position: 'relative', padding: collapsed ? '8px 0' : '10px 12px', borderBottom: '1px solid rgba(209,196,178,.06)', flexShrink: 0 }}>
          <button
            onClick={() => setOrgMenuOpen(v => !v)}
            title={collapsed ? activeOrg.nom : undefined}
            style={{
              width: '100%', display: 'flex', alignItems: 'center',
              gap: collapsed ? 0 : 8,
              justifyContent: collapsed ? 'center' : 'flex-start',
              padding: collapsed ? '6px 0' : '7px 9px',
              borderRadius: 6, border: '1px solid rgba(209,196,178,.08)',
              background: 'rgba(209,196,178,.04)', cursor: 'pointer',
              transition: 'all .15s',
            }}
          >
            <div style={{ width: 22, height: 22, borderRadius: 5, background: '#C9A96E', color: '#1C1814', display: 'grid', placeItems: 'center', fontSize: 11, fontWeight: 700, flexShrink: 0 }}>
              {activeOrg.nom[0]?.toUpperCase()}
            </div>
            {!collapsed && (
              <>
                <div style={{ flex: 1, minWidth: 0, textAlign: 'left' }}>
                  <div style={{ fontSize: 11, color: 'rgba(209,196,178,.85)', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {activeOrg.nom}
                  </div>
                  <div style={{ fontSize: 8, color: 'rgba(209,196,178,.35)', textTransform: 'uppercase', letterSpacing: '.1em', marginTop: 1 }}>
                    {activeOrg.role.replace('_', ' ')}
                  </div>
                </div>
                <span style={{ color: 'rgba(209,196,178,.3)', fontSize: 9 }}>▾</span>
              </>
            )}
          </button>

          {orgMenuOpen && !collapsed && (
            <div style={{
              position: 'absolute', top: '100%', left: 12, right: 12, marginTop: 4,
              background: '#26201B', border: '1px solid rgba(209,196,178,.1)',
              borderRadius: 6, boxShadow: '0 8px 24px rgba(0,0,0,.4)',
              zIndex: 1000, overflow: 'hidden',
            }}>
              <div style={{ maxHeight: 240, overflowY: 'auto', padding: '4px 0' }}>
                {orgs.map(o => (
                  <button
                    key={o.id}
                    onClick={() => switchOrg(o.id)}
                    disabled={switching}
                    style={{
                      width: '100%', display: 'flex', alignItems: 'center', gap: 8,
                      padding: '7px 10px', border: 'none',
                      background: o.isActive ? 'rgba(209,196,178,.08)' : 'transparent',
                      cursor: switching ? 'wait' : 'pointer',
                      color: 'rgba(209,196,178,.85)', fontSize: 11, textAlign: 'left',
                    }}
                    onMouseEnter={e => { if (!o.isActive) (e.currentTarget as HTMLButtonElement).style.background = 'rgba(209,196,178,.05)' }}
                    onMouseLeave={e => { if (!o.isActive) (e.currentTarget as HTMLButtonElement).style.background = 'transparent' }}
                  >
                    <div style={{ width: 18, height: 18, borderRadius: 4, background: '#C9A96E', color: '#1C1814', display: 'grid', placeItems: 'center', fontSize: 9, fontWeight: 700, flexShrink: 0 }}>
                      {o.nom[0]?.toUpperCase()}
                    </div>
                    <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{o.nom}</span>
                    {o.isActive && <span style={{ color: '#C9A96E', fontSize: 11 }}>✓</span>}
                  </button>
                ))}
              </div>
              <div style={{ borderTop: '1px solid rgba(209,196,178,.06)', padding: '4px 0' }}>
                <button onClick={() => { setOrgMenuOpen(false); router.push('/onboarding/new-org') }} style={dropdownLinkStyle}>+ Nouvelle organisation</button>
                {canManage && <>
                  <button onClick={() => { setOrgMenuOpen(false); router.push('/settings/team') }} style={dropdownLinkStyle}>Gérer l'équipe</button>
                  <button onClick={() => { setOrgMenuOpen(false); router.push('/activity') }} style={dropdownLinkStyle}>Journal d'activité</button>
                </>}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Nav items */}
      <nav style={{ padding: '10px 8px', flex: 1 }}>
        {NAV_ITEMS.map(item => {
          const active = pathname === item.href || pathname.startsWith(item.href + '/')
          const badge = badges[item.href]
          return (
            <button key={item.href} onClick={() => router.push(item.href)}
              title={collapsed ? item.label : undefined}
              style={{
                display: 'flex', alignItems: 'center', gap: 9, width: '100%',
                padding: collapsed ? '9px 0' : '9px 12px',
                justifyContent: collapsed ? 'center' : 'flex-start',
                borderRadius: 8, border: 'none',
                background: active ? 'rgba(209,196,178,.1)' : 'transparent',
                color: active ? '#D1C4B2' : 'rgba(209,196,178,.4)',
                fontSize: 11, cursor: 'pointer', marginBottom: 2,
                transition: 'all .15s',
              }}>
              <span style={{ fontSize: 14, flexShrink: 0 }}>{item.icon}</span>
              {!collapsed && (
                <>
                  <span style={{ flex: 1, textAlign: 'left' }}>{item.label}</span>
                  {badge ? (
                    <span style={{ background: '#C9A96E', color: '#1C1814', fontSize: 9, fontWeight: 700, padding: '1px 6px', borderRadius: 100 }}>{badge}</span>
                  ) : null}
                </>
              )}
            </button>
          )
        })}
      </nav>

      {/* User profile */}
      <div style={{ padding: '10px 10px 14px', borderTop: '1px solid rgba(209,196,178,.06)', flexShrink: 0 }}>
        {collapsed ? (
          <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'rgba(201,169,110,.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, color: '#C9A96E', margin: '0 auto', cursor: 'pointer' }}
            onClick={() => signOut({ callbackUrl: '/' })} title="Se déconnecter">
            {initials}
          </div>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', borderRadius: 8, background: 'rgba(209,196,178,.06)' }}>
            <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'rgba(201,169,110,.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700, color: '#C9A96E', flexShrink: 0 }}>
              {initials}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 11, color: 'rgba(209,196,178,.7)', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {session?.user?.name?.split(' ')[0] || 'Olivier'}
              </div>
              <div style={{ fontSize: 9, color: 'rgba(209,196,178,.3)', display: 'flex', alignItems: 'center', gap: 4, marginTop: 2 }}>
                <div style={{ width: 5, height: 5, borderRadius: '50%', background: '#28C840' }}/>
                Gmail connecté
              </div>
            </div>
            <button onClick={() => signOut({ callbackUrl: '/' })} title="Se déconnecter"
              style={{ background: 'none', border: 'none', color: 'rgba(209,196,178,.25)', cursor: 'pointer', fontSize: 14, padding: '2px 4px' }}>
              ↩
            </button>
          </div>
        )}
      </div>
    </aside>
  )
}

const dropdownLinkStyle: React.CSSProperties = {
  width: '100%', padding: '7px 10px', border: 'none',
  background: 'transparent', cursor: 'pointer',
  color: 'rgba(209,196,178,.5)', fontSize: 11, textAlign: 'left',
}
