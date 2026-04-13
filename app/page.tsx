'use client'
import { signIn, useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { useEffect } from 'react'

export default function LoginPage() {
  const { data: session, status } = useSession()
  const router = useRouter()

  // Rediriger si déjà connecté
  useEffect(() => {
    if (session) router.replace('/mails')
  }, [session, router])

  if (status === 'loading') return (
    <div style={styles.loader}>
      <div style={styles.spinner}/>
    </div>
  )

  return (
    <div style={styles.page}>
      <div style={styles.bg1}/><div style={styles.bg2}/>
      <div style={styles.card}>
        <div style={styles.logo}>
          <div style={styles.logoName}>ARCHANGE</div>
          <div style={styles.logoSub}>RÊVA · Agent IA</div>
          <div style={styles.logoLine}/>
        </div>
        <h1 style={styles.title}>Bienvenue</h1>
        <p style={styles.subtitle}>
          Connectez votre boîte Gmail pour synchroniser automatiquement vos demandes événementielles Zenchef en temps réel.
        </p>
        <button style={styles.btnGoogle} onClick={() => signIn('google', { callbackUrl: '/mails' })}>
          <GoogleIcon />
          Continuer avec Google
        </button>
        <div style={styles.hint}>reva13france@gmail.com</div>
        <div style={styles.security}>🔒 Connexion sécurisée · données chiffrées</div>
      </div>
    </div>
  )
}

function GoogleIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
    </svg>
  )
}

const styles: Record<string, React.CSSProperties> = {
  page: { minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', padding:24, background:'#F5F3EF', position:'relative', overflow:'hidden' },
  bg1:  { position:'absolute', top:-80, right:-80, width:300, height:300, borderRadius:'50%', background:'radial-gradient(circle, rgba(201,169,110,.08) 0%, transparent 70%)', pointerEvents:'none' },
  bg2:  { position:'absolute', bottom:-60, left:-60, width:240, height:240, borderRadius:'50%', background:'radial-gradient(circle, rgba(201,169,110,.06) 0%, transparent 70%)', pointerEvents:'none' },
  card: { background:'#FFFFFF', borderRadius:16, border:'1px solid #EAE6E1', padding:'40px 44px', width:'100%', maxWidth:420, textAlign:'center', boxShadow:'0 4px 24px rgba(28,24,20,.06)', position:'relative', zIndex:1 },
  logo: { marginBottom:32 },
  logoName: { fontFamily:"'Cormorant Garamond', serif", fontSize:28, fontWeight:300, color:'#1C1814', letterSpacing:'.12em' },
  logoSub:  { fontSize:10, color:'#8A8178', letterSpacing:'.22em', textTransform:'uppercase', marginTop:4 },
  logoLine: { width:40, height:1, background:'#C9A96E', margin:'10px auto 0' },
  title:    { fontFamily:"'Cormorant Garamond', serif", fontSize:22, fontWeight:400, color:'#1C1814', marginBottom:10 },
  subtitle: { fontSize:13, color:'#8A8178', lineHeight:1.65, marginBottom:28 },
  btnGoogle:{ display:'flex', alignItems:'center', justifyContent:'center', gap:12, width:'100%', padding:'13px 20px', borderRadius:10, border:'1px solid #EAE6E1', background:'#FFFFFF', cursor:'pointer', fontSize:14, fontWeight:500, color:'#1C1814', fontFamily:"'DM Sans', sans-serif", transition:'all .2s' },
  hint:     { fontSize:11, color:'#B0A898', marginTop:14 },
  security: { display:'flex', alignItems:'center', justifyContent:'center', gap:6, marginTop:24, paddingTop:20, borderTop:'1px solid #EAE6E1', fontSize:11, color:'#B0A898' },
  loader:   { height:'100vh', display:'flex', alignItems:'center', justifyContent:'center' },
  spinner:  { width:28, height:28, border:'2px solid #EAE6E1', borderTopColor:'#C9A96E', borderRadius:'50%', animation:'spin 0.7s linear infinite' },
}
