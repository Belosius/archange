'use client'
import { signIn, useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { useEffect } from 'react'

export default function LoginPage() {
  const { data: session, status } = useSession()
  const router = useRouter()

  useEffect(() => {
    if (status === 'authenticated') router.replace('/mails')
  }, [status, router])

  if (status === 'loading') return (
    <div style={{ height:'100vh', display:'flex', alignItems:'center', justifyContent:'center', background:'#F5F3EF' }}>
      <div style={{ width:28, height:28, border:'2px solid #EAE6E1', borderTopColor:'#C9A96E', borderRadius:'50%', animation:'spin .7s linear infinite' }}/>
      <style>{'@keyframes spin{to{transform:rotate(360deg)}}'}</style>
    </div>
  )

  return (
    <div style={{ height:'100vh', display:'flex', alignItems:'center', justifyContent:'center', background:'#F5F3EF', fontFamily:"'DM Sans', sans-serif" }}>
      <div style={{ textAlign:'center', maxWidth:340, padding:'0 24px' }}>
        <div style={{ fontFamily:"'Cormorant Garamond', serif", fontSize:32, fontWeight:300, color:'#1C1814', letterSpacing:'.08em', marginBottom:8 }}>
          ARCHANGE
        </div>
        <div style={{ fontSize:11, color:'#8A8178', letterSpacing:'.2em', textTransform:'uppercase', marginBottom:48 }}>
          RÊVA · Agent IA événementiel
        </div>
        <button
          onClick={() => signIn('google', { callbackUrl: '/mails' })}
          style={{ display:'flex', alignItems:'center', gap:12, width:'100%', padding:'14px 24px', background:'#1C1814', color:'#D1C4B2', border:'none', borderRadius:10, fontSize:13, fontWeight:500, cursor:'pointer', justifyContent:'center', letterSpacing:'.03em', transition:'opacity .15s' }}
          onMouseOver={e => (e.currentTarget.style.opacity='.85')}
          onMouseOut={e => (e.currentTarget.style.opacity='1')}
        >
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
            <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" fill="#4285F4"/>
            <path d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332C2.438 15.983 5.482 18 9 18z" fill="#34A853"/>
            <path d="M3.964 10.71c-.18-.54-.282-1.117-.282-1.71s.102-1.17.282-1.71V4.958H.957C.347 6.173 0 7.548 0 9s.348 2.827.957 4.042l3.007-2.332z" fill="#FBBC05"/>
            <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0 5.482 0 2.438 2.017.957 4.958L3.964 6.29C4.672 4.163 6.656 3.58 9 3.58z" fill="#EA4335"/>
          </svg>
          Se connecter avec Google
        </button>
        <div style={{ marginTop:24, fontSize:11, color:'#C4BDB5', lineHeight:1.6 }}>
          Connexion sécurisée · Accès Gmail requis
        </div>
      </div>
    </div>
  )
}
