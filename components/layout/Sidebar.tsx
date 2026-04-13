'use client'
import { useSession, signOut } from 'next-auth/react'
import { usePathname, useRouter } from 'next/navigation'
import { useState } from 'react'

const NAV_ITEMS = [
  { href: '/events',   icon: '◈', label: 'Événements' },
  { href: '/mails',    icon: '⌁', label: 'Mails'      },
  { href: '/planning', icon: '⧖', label: 'Planning'   },
  { href: '/stats',    icon: '◎', label: 'Stats'      },
  { href: '/sources',  icon: '⟡', label: 'Sources IA' },
]

interface SidebarProps {
  badges?: Record<string, number>
}

export function Sidebar({ badges = {} }: SidebarProps) {
  const { data: session } = useSession()
  const pathname = usePathname()
  const router = useRouter()
  const [collapsed, setCollapsed] = useState(false)

  const initials = session?.user?.name
    ?.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase() || 'OT'

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
            <div style={{ fontSize: 8, color: 'rgba(209,196,178,.3)', letterSpacing: '.18em', textTransform: 'uppercase', marginTop: 3 }}>RÊVA · AGENT IA</div>
          </div>
        )}
        <button onClick={() => setCollapsed(v => !v)} style={{ width: 22, height: 22, borderRadius: 5, border: 'none', background: 'rgba(209,196,178,.07)', color: 'rgba(209,196,178,.35)', cursor: 'pointer', fontSize: 11, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          {collapsed ? '›' : '‹'}
        </button>
      </div>

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
