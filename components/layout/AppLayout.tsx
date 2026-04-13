'use client'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { useEffect } from 'react'
import { Sidebar } from '@/components/layout/Sidebar'

interface AppLayoutProps {
  children: React.ReactNode
  badges?: Record<string, number>
}

export function AppLayout({ children, badges }: AppLayoutProps) {
  const { data: session, status } = useSession()
  const router = useRouter()

  useEffect(() => {
    if (status === 'unauthenticated') router.replace('/')
  }, [status, router])

  if (status === 'loading') return (
    <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#F5F3EF' }}>
      <div style={{ width: 28, height: 28, border: '2px solid #EAE6E1', borderTopColor: '#C9A96E', borderRadius: '50%', animation: 'spin .7s linear infinite' }}/>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  )

  if (!session) return null

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden', fontFamily: "'DM Sans', sans-serif", background: '#F5F3EF' }}>
      <Sidebar badges={badges} />
      <main style={{ flex: 1, display: 'flex', overflow: 'hidden', minWidth: 0 }}>
        {children}
      </main>
    </div>
  )
}
