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

// Logo calice doré (SVG identique à celui de /mails)
function ArchangeLogo({ size = 26 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0 }}>
      <circle cx="12" cy="12" r="11" stroke="#B8924F" strokeWidth="1" />
      <path d="M12 9 C 9.5 9, 7 9.5, 5 10.5 C 6.8 10.8, 8.5 10.7, 10.5 10.2" stroke="#B8924F" strokeWidth="0.9" fill="none" strokeLinecap="round" />
      <path d="M12 9 C 14.5 9, 17 9.5, 19 10.5 C 17.2 10.8, 15.5 10.7, 13.5 10.2" stroke="#B8924F" strokeWidth="0.9" fill="none" strokeLinecap="round" />
      <path d="M8.5 9 L 15.5 9" stroke="#B8924F" strokeWidth="1.2" strokeLinecap="round" />
      <circle cx="12" cy="7" r="1.1" fill="#B8924F" />
      <path d="M12 9.6 L 12 18.2" stroke="#B8924F" strokeWidth="1.2" strokeLinecap="round" />
      <path d="M10.8 17.8 L 12 19.2 L 13.2 17.8 Z" fill="#B8924F" />
    </svg>
  )
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
  const firstName = session?.user?.name?.split(' ')[0] || 'Olivier'

  useEffect(() => {
    fetch('/api/orgs')
      .then(r => r.ok ? r.json() : Promise.reject())
      .then(data => setOrgs(data.orgs || []))
      .catch(() => {})
  }, [])

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
      alert('Impossible de changer d\'organisation')
      setSwitching(false)
    }
  }

  return (
    <aside style={{
      width: collapsed ? 52 : 220,
      background: '#FAFAF7',
      display: 'flex',
      flexDirection: 'column',
      flexShrink: 0,
      transition: 'width .3s cubic-bezier(.4,0,.2,1)',
      overflow: 'hidden',
      borderRight: '1px solid #EBEAE5',
    }}>
      {/* Header */}
      <div style={{
        padding: collapsed ? '14px 0 12px' : '18px 18px 14px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: collapsed ? 'center' : 'space-between',
        flexShrink: 0,
        borderBottom: '1px solid #EBEAE5',
      }}>
        {!collapsed && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
            <ArchangeLogo size={26} />
            <div>
              <div style={{
                fontFamily: "'Fraunces',Georgia,serif",
                fontSize: 19,
                fontWeight: 500,
                color: '#1A1A1E',
                letterSpacing: 0.3,
                lineHeight: 1,
              }}>Archange</div>
              <div style={{
                fontSize: 9,
                letterSpacing: '0.16em',
                textTransform: 'uppercase',
                color: '#6B6E7E',
                marginTop: 2,
              }}>Agent IA</div>
            </div>
          </div>
        )}
        {collapsed && <ArchangeLogo size={20} />}
        <button
          onClick={() => setCollapsed(v => !v)}
          title={collapsed ? 'Agrandir' : 'Réduire'}
          style={{
            width: 20,
            height: 20,
            borderRadius: 2,
            border: '1px solid #EBEAE5',
            background: 'transparent',
            color: '#6B6E7E',
            cursor: 'pointer',
            fontSize: 9,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
            marginLeft: collapsed ? 0 : 6,
          }}
        >
          {collapsed ? '›' : '‹'}
        </button>
      </div>

      {/* Org switcher */}
      {activeOrg && (
        <div ref={orgRef} style={{
          position: 'relative',
          padding: collapsed ? '8px 0' : '10px 12px',
          borderBottom: '1px solid #EBEAE5',
          flexShrink: 0,
        }}>
          <button
            onClick={() => setOrgMenuOpen(v => !v)}
            title={collapsed ? activeOrg.nom : undefined}
            style={{
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              gap: collapsed ? 0 : 8,
              justifyContent: collapsed ? 'center' : 'flex-start',
              padding: collapsed ? '6px 0' : '7px 9px',
              borderRadius: 6,
              border: '1px solid #EBEAE5',
              background: '#FFFFFF',
              cursor: 'pointer',
              transition: 'all .15s',
              fontFamily: 'inherit',
            }}
            onMouseEnter={e => (e.currentTarget.style.background = '#F5F4F0')}
            onMouseLeave={e => (e.currentTarget.style.background = '#FFFFFF')}
          >
            <div style={{
              width: 22,
              height: 22,
              borderRadius: 5,
              background: '#B8924F',
              color: '#FFFFFF',
              display: 'grid',
              placeItems: 'center',
              fontSize: 11,
              fontWeight: 700,
              flexShrink: 0,
            }}>
              {activeOrg.nom[0]?.toUpperCase()}
            </div>
            {!collapsed && (
              <>
                <div style={{ flex: 1, minWidth: 0, textAlign: 'left' }}>
                  <div style={{
                    fontSize: 12,
                    color: '#1A1A1E',
                    fontWeight: 500,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}>
                    {activeOrg.nom}
                  </div>
                  <div style={{
                    fontSize: 9,
                    color: '#6B6E7E',
                    textTransform: 'uppercase',
                    letterSpacing: '0.1em',
                    marginTop: 1,
                  }}>
                    {activeOrg.role.replace('_', ' ')}
                  </div>
                </div>
                <span style={{ color: '#6B6E7E', fontSize: 9 }}>▾</span>
              </>
            )}
          </button>

          {orgMenuOpen && !collapsed && (
            <div style={{
              position: 'absolute',
              top: '100%',
              left: 12,
              right: 12,
              marginTop: 4,
              background: '#FFFFFF',
              border: '1px solid #EBEAE5',
              borderRadius: 6,
              boxShadow: '0 8px 24px rgba(0,0,0,.08)',
              zIndex: 1000,
              overflow: 'hidden',
            }}>
              <div style={{ maxHeight: 240, overflowY: 'auto', padding: '4px 0' }}>
                {orgs.map(o => (
                  <button
                    key={o.id}
                    onClick={() => switchOrg(o.id)}
                    disabled={switching}
                    style={{
                      width: '100%',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      padding: '7px 10px',
                      border: 'none',
                      background: o.isActive ? '#F5F4F0' : 'transparent',
                      cursor: switching ? 'wait' : 'pointer',
                      color: '#1A1A1E',
                      fontSize: 12,
                      textAlign: 'left',
                      fontFamily: 'inherit',
                    }}
                    onMouseEnter={e => { if (!o.isActive) (e.currentTarget as HTMLButtonElement).style.background = '#FAFAF7' }}
                    onMouseLeave={e => { if (!o.isActive) (e.currentTarget as HTMLButtonElement).style.background = 'transparent' }}
                  >
                    <div style={{
                      width: 18,
                      height: 18,
                      borderRadius: 4,
                      background: '#B8924F',
                      color: '#FFFFFF',
                      display: 'grid',
                      placeItems: 'center',
                      fontSize: 9,
                      fontWeight: 700,
                      flexShrink: 0,
                    }}>
                      {o.nom[0]?.toUpperCase()}
                    </div>
                    <span style={{
                      flex: 1,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}>{o.nom}</span>
                    {o.isActive && <span style={{ color: '#B8924F', fontSize: 11 }}>✓</span>}
                  </button>
                ))}
              </div>
              <div style={{ borderTop: '1px solid #EBEAE5', padding: '4px 0' }}>
                <button
                  onClick={() => { setOrgMenuOpen(false); router.push('/onboarding/new-org') }}
                  style={dropdownLinkStyle}
                  onMouseEnter={e => (e.currentTarget.style.background = '#FAFAF7')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                >+ Nouvelle organisation</button>
                {canManage && <>
                  <button
                    onClick={() => { setOrgMenuOpen(false); router.push('/settings/team') }}
                    style={dropdownLinkStyle}
                    onMouseEnter={e => (e.currentTarget.style.background = '#FAFAF7')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                  >Gérer l'équipe</button>
                  <button
                    onClick={() => { setOrgMenuOpen(false); router.push('/activity') }}
                    style={dropdownLinkStyle}
                    onMouseEnter={e => (e.currentTarget.style.background = '#FAFAF7')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                  >Journal d'activité</button>
                </>}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Nav items */}
      <nav style={{ flex: 1, padding: collapsed ? '6px 5px' : '8px 8px', display: 'flex', flexDirection: 'column', gap: 1, overflowY: 'auto' }}>
        {NAV_ITEMS.map(item => {
          const active = pathname === item.href || pathname.startsWith(item.href + '/')
          const badge = badges[item.href]
          return (
            <button
              key={item.href}
              onClick={() => router.push(item.href)}
              title={collapsed ? item.label : undefined}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: collapsed ? 0 : 9,
                width: '100%',
                padding: collapsed ? '10px 0' : '7px 10px',
                borderRadius: 3,
                border: 'none',
                background: active ? '#F5F4F0' : 'transparent',
                color: active ? '#1A1A1E' : '#4A4A52',
                fontSize: 12,
                textAlign: 'left',
                cursor: 'pointer',
                justifyContent: collapsed ? 'center' : 'flex-start',
                position: 'relative',
                transition: 'all .12s',
                letterSpacing: '0.03em',
                fontWeight: active ? 500 : 400,
                fontFamily: "'Geist','system-ui',sans-serif",
              }}
              onMouseEnter={e => { if (!active) (e.currentTarget as HTMLButtonElement).style.background = '#F5F4F0' }}
              onMouseLeave={e => { if (!active) (e.currentTarget as HTMLButtonElement).style.background = 'transparent' }}
            >
              <span style={{ fontSize: 14, flexShrink: 0, color: active ? '#B8924F' : '#6B6E7E' }}>{item.icon}</span>
              {!collapsed && (
                <>
                  <span style={{ flex: 1 }}>{item.label}</span>
                  {badge ? (
                    <span style={{
                      fontSize: 10,
                      background: active ? 'rgba(184,146,79,0.12)' : 'rgba(27,30,43,0.06)',
                      color: active ? '#B8924F' : '#6B6E7E',
                      padding: '1px 5px',
                      borderRadius: 2,
                      fontWeight: 500,
                    }}>{badge}</span>
                  ) : null}
                </>
              )}
              {collapsed && badge ? (
                <span style={{
                  position: 'absolute',
                  top: 5,
                  right: 5,
                  width: 5,
                  height: 5,
                  borderRadius: '50%',
                  background: '#B8924F',
                }} />
              ) : null}
            </button>
          )
        })}
      </nav>

      {/* User profile */}
      {!collapsed && (
        <div style={{ padding: '12px 14px', borderTop: '1px solid #EBEAE5', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
            <div style={{
              width: 22,
              height: 22,
              borderRadius: '50%',
              background: '#1A1A1E',
              color: '#F5F4F0',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 10,
              fontWeight: 500,
              flexShrink: 0,
            }}>
              {initials[0]}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{
                fontSize: 11,
                fontWeight: 500,
                color: '#1A1A1E',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}>{firstName}</div>
              <button
                onClick={() => signOut({ callbackUrl: '/' })}
                style={{
                  fontSize: 9.5,
                  color: '#6B6E7E',
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  padding: 0,
                  letterSpacing: '0.05em',
                  textTransform: 'uppercase',
                  fontFamily: "'Geist','system-ui',sans-serif",
                }}
              >⎋ Déconnexion</button>
            </div>
          </div>
        </div>
      )}
      {collapsed && (
        <div style={{ padding: '10px 0', borderTop: '1px solid #EBEAE5', flexShrink: 0 }}>
          <div
            onClick={() => signOut({ callbackUrl: '/' })}
            title="Se déconnecter"
            style={{
              width: 26,
              height: 26,
              borderRadius: '50%',
              background: '#1A1A1E',
              color: '#F5F4F0',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 10,
              fontWeight: 500,
              margin: '0 auto',
              cursor: 'pointer',
            }}
          >
            {initials[0]}
          </div>
        </div>
      )}
    </aside>
  )
}

const dropdownLinkStyle: React.CSSProperties = {
  width: '100%',
  padding: '7px 10px',
  border: 'none',
  background: 'transparent',
  cursor: 'pointer',
  color: '#6B6E7E',
  fontSize: 11,
  textAlign: 'left',
  fontFamily: 'inherit',
}
