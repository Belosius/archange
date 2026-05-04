'use client'

/**
 * ═══════════════════════════════════════════════════════════════
 *  components/layout/Sidebar — Sidebar partagée (mode CLAIR)
 * ═══════════════════════════════════════════════════════════════
 *
 * Utilisée par /events, /planning, /sources, /stats.
 * (La page /mails a sa propre sidebar inline — même style cible.)
 *
 * Design : background #FAFAF7, accent #B8924F, fonts Fraunces/Geist.
 *
 * Modifications Phase E1 (chantier 1) :
 *  - Refonte couleurs : sombre → clair (harmonisation avec /mails)
 *  - Footer "Mon profil" cliquable vers /settings/profile
 *  - Bouton signOut (↩) séparé avec stopPropagation
 */

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

// ─── Palette claire RÊVA ────────────────────────────────────────
const C = {
  bg:           '#FAFAF7',
  bgHover:      '#F5F4F0',
  bgActive:     '#F0EBE0',
  bgCard:       '#FFFFFF',
  border:       '#EBEAE5',
  borderStrong: '#DBDAD3',
  textPrimary:  '#1A1A1E',
  textSec:      '#6B6E7E',
  textTer:      '#A0A0A8',
  accent:       '#B8924F',
  accentHover:  '#A07E40',
  greenDot:     '#1F6B3A',
}

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
  const [profileHover, setProfileHover] = useState(false)
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
  const hasMultipleOrgs = orgs.length > 1

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
      alert("Impossible de changer d'organisation")
      setSwitching(false)
    }
  }

  const goToProfile = () => router.push('/settings/profile')

  return (
    <aside style={{
      width: collapsed ? 60 : 220,
      background: C.bg,
      display: 'flex',
      flexDirection: 'column',
      flexShrink: 0,
      borderRight: `1px solid ${C.border}`,
      transition: 'width .25s cubic-bezier(.4,0,.2,1)',
      overflow: 'hidden',
      fontFamily: "'Geist','Helvetica Neue',Arial,sans-serif",
      color: C.textPrimary,
    }}>
      {/* ─── Header : logo ARCHANGE + bouton collapse ─────────── */}
      <div style={{
        padding: collapsed ? '18px 0 14px' : '20px 16px 16px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: collapsed ? 'center' : 'space-between',
        borderBottom: `1px solid ${C.border}`,
        flexShrink: 0,
      }}>
        {!collapsed && (
          <div>
            <div style={{
              fontFamily: "'Fraunces',Georgia,serif",
              fontSize: 16,
              fontWeight: 600,
              color: C.textPrimary,
              letterSpacing: '.02em',
              lineHeight: 1,
            }}>
              ARCHANGE
            </div>
            <div style={{
              fontSize: 9,
              color: C.textSec,
              letterSpacing: '.18em',
              textTransform: 'uppercase',
              marginTop: 4,
              fontWeight: 500,
            }}>
              Agent email
            </div>
          </div>
        )}
        <button
          onClick={() => setCollapsed(v => !v)}
          title={collapsed ? 'Développer' : 'Réduire'}
          style={{
            width: 24, height: 24, borderRadius: 6,
            border: `1px solid ${C.border}`,
            background: C.bgCard,
            color: C.textSec,
            cursor: 'pointer',
            fontSize: 12,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          {collapsed ? '›' : '‹'}
        </button>
      </div>

      {/* ─── Org switcher ─────────────────────────────────────── */}
      {activeOrg && (
        <div ref={orgRef} style={{
          position: 'relative',
          padding: collapsed ? '10px 0' : '12px 12px',
          borderBottom: `1px solid ${C.border}`,
          flexShrink: 0,
        }}>
          <button
            onClick={() => hasMultipleOrgs && setOrgMenuOpen(v => !v)}
            title={collapsed ? activeOrg.nom : (hasMultipleOrgs ? 'Changer d\'organisation' : activeOrg.nom)}
            style={{
              width: '100%', display: 'flex', alignItems: 'center',
              gap: collapsed ? 0 : 9,
              justifyContent: collapsed ? 'center' : 'flex-start',
              padding: collapsed ? '7px 0' : '8px 10px',
              borderRadius: 8,
              border: `1px solid ${C.border}`,
              background: orgMenuOpen ? C.bgActive : C.bgCard,
              cursor: hasMultipleOrgs ? 'pointer' : 'default',
              transition: 'background .12s, border-color .12s',
              fontFamily: 'inherit',
            }}
            onMouseEnter={e => {
              if (hasMultipleOrgs) {
                (e.currentTarget as HTMLButtonElement).style.background = C.bgHover
              }
            }}
            onMouseLeave={e => {
              if (!orgMenuOpen) {
                (e.currentTarget as HTMLButtonElement).style.background = C.bgCard
              }
            }}
          >
            <div style={{
              width: 26, height: 26, borderRadius: 6,
              background: C.accent,
              color: '#FFFFFF',
              display: 'grid', placeItems: 'center',
              fontSize: 12, fontWeight: 700,
              flexShrink: 0,
              fontFamily: "'Fraunces',Georgia,serif",
            }}>
              {activeOrg.nom[0]?.toUpperCase()}
            </div>
            {!collapsed && (
              <>
                <div style={{ flex: 1, minWidth: 0, textAlign: 'left' }}>
                  <div style={{
                    fontSize: 13,
                    color: C.textPrimary,
                    fontWeight: 600,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    lineHeight: 1.2,
                  }}>
                    {activeOrg.nom}
                  </div>
                  <div style={{
                    fontSize: 9,
                    color: C.textSec,
                    textTransform: 'uppercase',
                    letterSpacing: '.1em',
                    marginTop: 2,
                    fontWeight: 600,
                  }}>
                    {activeOrg.role.replace('_', ' ')}
                  </div>
                </div>
                {hasMultipleOrgs && (
                  <span style={{ color: C.textSec, fontSize: 10, flexShrink: 0 }}>▾</span>
                )}
              </>
            )}
          </button>

          {/* Dropdown menu */}
          {orgMenuOpen && !collapsed && (
            <div style={{
              position: 'absolute',
              top: '100%',
              left: 12, right: 12,
              marginTop: 6,
              background: C.bgCard,
              border: `1px solid ${C.borderStrong}`,
              borderRadius: 8,
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
                      gap: 9,
                      padding: '8px 12px',
                      border: 'none',
                      background: o.isActive ? C.bgActive : 'transparent',
                      cursor: switching ? 'wait' : 'pointer',
                      color: C.textPrimary,
                      fontSize: 12,
                      textAlign: 'left',
                      fontFamily: 'inherit',
                      transition: 'background .1s',
                    }}
                    onMouseEnter={e => {
                      if (!o.isActive) (e.currentTarget as HTMLButtonElement).style.background = C.bgHover
                    }}
                    onMouseLeave={e => {
                      if (!o.isActive) (e.currentTarget as HTMLButtonElement).style.background = 'transparent'
                    }}
                  >
                    <div style={{
                      width: 20, height: 20, borderRadius: 5,
                      background: C.accent,
                      color: '#FFFFFF',
                      display: 'grid', placeItems: 'center',
                      fontSize: 10, fontWeight: 700,
                      flexShrink: 0,
                      fontFamily: "'Fraunces',Georgia,serif",
                    }}>
                      {o.nom[0]?.toUpperCase()}
                    </div>
                    <span style={{
                      flex: 1,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                      fontWeight: o.isActive ? 600 : 500,
                    }}>
                      {o.nom}
                    </span>
                    {o.isActive && <span style={{ color: C.accent, fontSize: 12, fontWeight: 700 }}>✓</span>}
                  </button>
                ))}
              </div>
              <div style={{ borderTop: `1px solid ${C.border}`, padding: '4px 0' }}>
                <button
                  onClick={() => { setOrgMenuOpen(false); router.push('/onboarding/new-org') }}
                  style={dropdownLinkStyle}
                  onMouseEnter={e => (e.currentTarget as HTMLButtonElement).style.background = C.bgHover}
                  onMouseLeave={e => (e.currentTarget as HTMLButtonElement).style.background = 'transparent'}
                >
                  + Nouvelle organisation
                </button>
                {canManage && (
                  <>
                    <button
                      onClick={() => { setOrgMenuOpen(false); router.push('/settings/team') }}
                      style={dropdownLinkStyle}
                      onMouseEnter={e => (e.currentTarget as HTMLButtonElement).style.background = C.bgHover}
                      onMouseLeave={e => (e.currentTarget as HTMLButtonElement).style.background = 'transparent'}
                    >
                      Gérer l'équipe
                    </button>
                    <button
                      onClick={() => { setOrgMenuOpen(false); router.push('/activity') }}
                      style={dropdownLinkStyle}
                      onMouseEnter={e => (e.currentTarget as HTMLButtonElement).style.background = C.bgHover}
                      onMouseLeave={e => (e.currentTarget as HTMLButtonElement).style.background = 'transparent'}
                    >
                      Journal d'activité
                    </button>
                  </>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ─── Nav items ─────────────────────────────────────────── */}
      <nav style={{ padding: '12px 8px', flex: 1 }}>
        {NAV_ITEMS.map(item => {
          const active = pathname === item.href || pathname.startsWith(item.href + '/')
          const badge = badges[item.href]
          return (
            <NavButton
              key={item.href}
              icon={item.icon}
              label={item.label}
              active={active}
              badge={badge}
              collapsed={collapsed}
              onClick={() => router.push(item.href)}
            />
          )
        })}
      </nav>

      {/* ─── Footer : Mon profil (cliquable) + Déconnexion ─────── */}
      <div style={{
        padding: '10px 10px 14px',
        borderTop: `1px solid ${C.border}`,
        flexShrink: 0,
      }}>
        {collapsed ? (
          // Mode replié : avatar simple cliquable vers profil
          <button
            type="button"
            onClick={goToProfile}
            title="Mon profil"
            style={{
              width: 36, height: 36, borderRadius: '50%',
              background: profileHover ? C.bgActive : C.bgCard,
              border: `1px solid ${C.border}`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 12, fontWeight: 700,
              color: C.accent,
              margin: '0 auto',
              cursor: 'pointer',
              fontFamily: "'Fraunces',Georgia,serif",
              transition: 'background .12s',
              padding: 0,
            }}
            onMouseEnter={() => setProfileHover(true)}
            onMouseLeave={() => setProfileHover(false)}
          >
            {initials}
          </button>
        ) : (
          // Mode déplié : carte cliquable + bouton ↩ séparé
          <div
            role="button"
            tabIndex={0}
            onClick={goToProfile}
            onKeyDown={e => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                goToProfile()
              }
            }}
            onMouseEnter={() => setProfileHover(true)}
            onMouseLeave={() => setProfileHover(false)}
            title="Voir mon profil"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 9,
              padding: '8px 10px',
              borderRadius: 8,
              background: profileHover ? C.bgActive : C.bgCard,
              border: `1px solid ${C.border}`,
              cursor: 'pointer',
              transition: 'background .12s',
              outline: 'none',
            }}
          >
            <div style={{
              width: 30, height: 30, borderRadius: '50%',
              background: C.accent,
              color: '#FFFFFF',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 11, fontWeight: 700,
              flexShrink: 0,
              fontFamily: "'Fraunces',Georgia,serif",
            }}>
              {initials}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{
                fontSize: 13,
                color: C.textPrimary,
                fontWeight: 600,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                lineHeight: 1.2,
              }}>
                {session?.user?.name?.split(' ')[0] || 'Profil'}
              </div>
              <div style={{
                fontSize: 10,
                color: C.textSec,
                display: 'flex',
                alignItems: 'center',
                gap: 5,
                marginTop: 3,
                fontWeight: 500,
              }}>
                <span style={{
                  width: 5, height: 5, borderRadius: '50%',
                  background: C.greenDot,
                  flexShrink: 0,
                }}/>
                Voir mon profil
              </div>
            </div>
            <button
              onClick={e => { e.stopPropagation(); signOut({ callbackUrl: '/' }) }}
              title="Se déconnecter"
              style={{
                background: 'transparent',
                border: 'none',
                color: C.textSec,
                cursor: 'pointer',
                fontSize: 14,
                padding: '4px 6px',
                borderRadius: 5,
                lineHeight: 1,
                fontFamily: 'inherit',
              }}
              onMouseEnter={e => (e.currentTarget as HTMLButtonElement).style.color = C.textPrimary}
              onMouseLeave={e => (e.currentTarget as HTMLButtonElement).style.color = C.textSec}
            >
              ↩
            </button>
          </div>
        )}
      </div>
    </aside>
  )
}

// ─── Sous-composant : bouton de navigation ──────────────────────
function NavButton({
  icon, label, active, badge, collapsed, onClick,
}: {
  icon: string
  label: string
  active: boolean
  badge?: number
  collapsed: boolean
  onClick: () => void
}) {
  const [hover, setHover] = useState(false)

  let bg = 'transparent'
  if (active) bg = C.bgActive
  else if (hover) bg = C.bgHover

  let color = C.textSec
  if (active) color = C.textPrimary

  return (
    <button
      onClick={onClick}
      title={collapsed ? label : undefined}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        width: '100%',
        padding: collapsed ? '10px 0' : '10px 12px',
        justifyContent: collapsed ? 'center' : 'flex-start',
        borderRadius: 8,
        border: 'none',
        background: bg,
        color: color,
        fontSize: 13,
        fontWeight: active ? 600 : 500,
        cursor: 'pointer',
        marginBottom: 2,
        transition: 'background .12s, color .12s',
        fontFamily: 'inherit',
      }}
    >
      <span style={{
        fontSize: 16,
        flexShrink: 0,
        color: active ? C.accent : color,
        transition: 'color .12s',
      }}>{icon}</span>
      {!collapsed && (
        <>
          <span style={{ flex: 1, textAlign: 'left' }}>{label}</span>
          {badge ? (
            <span style={{
              background: active ? C.accent : C.borderStrong,
              color: active ? '#FFFFFF' : C.textPrimary,
              fontSize: 10,
              fontWeight: 700,
              padding: '2px 7px',
              borderRadius: 100,
              minWidth: 18,
              textAlign: 'center',
              fontVariantNumeric: 'tabular-nums',
            }}>
              {badge}
            </span>
          ) : null}
        </>
      )}
    </button>
  )
}

// ─── Style des liens du dropdown ─────────────────────────────────
const dropdownLinkStyle: React.CSSProperties = {
  width: '100%',
  padding: '8px 12px',
  border: 'none',
  background: 'transparent',
  cursor: 'pointer',
  color: C.textSec,
  fontSize: 12,
  textAlign: 'left',
  fontFamily: 'inherit',
  transition: 'background .1s',
  fontWeight: 500,
}
