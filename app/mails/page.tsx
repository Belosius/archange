'use client'
import { useEffect } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'

export default function MailsRedirect() {
  const { status } = useSession()
  const router = useRouter()
  
  useEffect(() => {
    if (status === 'unauthenticated') router.replace('/')
  }, [status, router])

  if (status === 'loading') return (
    <div style={{display:'flex',alignItems:'center',justifyContent:'center',height:'100vh',background:'#1C1814',color:'#D1C4B2',fontFamily:'sans-serif'}}>
      <div>Chargement ARCHANGE...</div>
    </div>
  )

  return (
    <div style={{display:'flex',alignItems:'center',justifyContent:'center',height:'100vh',background:'#1C1814',color:'#D1C4B2',fontFamily:'sans-serif',flexDirection:'column',gap:16}}>
      <div style={{fontSize:24,fontWeight:700,letterSpacing:'0.2em'}}>ARCHANGE</div>
      <div style={{fontSize:12,opacity:.5,letterSpacing:'0.1em'}}>RÊVA · AGENT IA</div>
      <div style={{marginTop:8,fontSize:14,opacity:.7}}>✓ Connecté</div>
    </div>
  )
}