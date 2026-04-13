'use client'
import { useSession } from 'next-auth/react'
import { useEffect, useState } from 'react'

export default function MailsPage() {
  const { data: session, status } = useSession()
  const [emails, setEmails] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<any>(null)

  useEffect(() => {
    if (status === 'authenticated') {
      fetch('/api/emails')
        .then(r => r.json())
        .then(data => { setEmails(Array.isArray(data) ? data : []); setLoading(false) })
        .catch(() => setLoading(false))
    }
    if (status === 'unauthenticated') window.location.href = '/'
  }, [status])

  if (status === 'loading' || loading) return (
    <div style={{ height:'100vh', display:'flex', alignItems:'center', justifyContent:'center', background:'#F5F3EF', fontFamily:"'DM Sans',sans-serif" }}>
      <div style={{ textAlign:'center' }}>
        <div style={{ width:32, height:32, border:'2px solid #EAE6E1', borderTopColor:'#C9A96E', borderRadius:'50%', animation:'spin .7s linear infinite', margin:'0 auto 12px' }}/>
        <style>{'@keyframes spin{to{transform:rotate(360deg)}}'}</style>
        <div style={{ color:'#8A8178', fontSize:13 }}>Chargement des emails...</div>
      </div>
    </div>
  )

  return (
    <div style={{ display:'flex', height:'100vh', overflow:'hidden', fontFamily:"'DM Sans',sans-serif", background:'#F5F3EF' }}>
      {/* Sidebar */}
      <div style={{ width:200, background:'#1C1814', display:'flex', flexDirection:'column', flexShrink:0 }}>
        <div style={{ padding:'20px 16px 16px', borderBottom:'1px solid rgba(209,196,178,.06)' }}>
          <div style={{ fontFamily:"'Cormorant Garamond',serif", fontSize:13, fontWeight:600, color:'rgba(209,196,178,.85)', letterSpacing:'.12em' }}>ARCHANGE</div>
          <div style={{ fontSize:8, color:'rgba(209,196,178,.3)', letterSpacing:'.18em', textTransform:'uppercase', marginTop:3 }}>RÊVA · AGENT IA</div>
        </div>
        <nav style={{ padding:'10px 8px', flex:1 }}>
          {[['◈','/events','Événements'],['⌁','/mails','Mails'],['⧖','/planning','Planning'],['◎','/stats','Stats'],['⟡','/sources','Sources IA']].map(([icon,href,label]) => (
            <button key={href} onClick={()=>window.location.href=href}
              style={{ display:'flex', alignItems:'center', gap:9, width:'100%', padding:'9px 12px', borderRadius:8, border:'none', background:window.location.pathname===href?'rgba(209,196,178,.1)':'transparent', color:window.location.pathname===href?'#D1C4B2':'rgba(209,196,178,.4)', fontSize:11, cursor:'pointer', marginBottom:2 }}>
              <span style={{ fontSize:14 }}>{icon}</span><span>{label}</span>
            </button>
          ))}
        </nav>
        <div style={{ padding:'10px', borderTop:'1px solid rgba(209,196,178,.06)' }}>
          <div style={{ fontSize:11, color:'rgba(209,196,178,.5)', textAlign:'center' }}>{session?.user?.email?.split('@')[0]}</div>
        </div>
      </div>

      {/* Liste emails */}
      <div style={{ width:320, borderRight:'1px solid #EAE6E1', display:'flex', flexDirection:'column', overflow:'hidden', flexShrink:0 }}>
        <div style={{ padding:'16px 20px 12px', borderBottom:'1px solid #EAE6E1', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
          <div style={{ fontSize:13, fontWeight:600, color:'#1C1814' }}>Mails <span style={{ fontSize:11, color:'#8A8178', fontWeight:400 }}>({emails.length})</span></div>
          <button onClick={()=>{setLoading(true);fetch('/api/emails',{method:'POST'}).then(()=>fetch('/api/emails').then(r=>r.json()).then(d=>{setEmails(Array.isArray(d)?d:[]);setLoading(false)}))}} style={{ fontSize:11, color:'#C9A96E', background:'none', border:'1px solid #EAE6E1', borderRadius:6, padding:'4px 10px', cursor:'pointer' }}>↻ Sync</button>
        </div>
        <div style={{ flex:1, overflowY:'auto' }}>
          {emails.map(email => (
            <div key={email.id} onClick={()=>setSelected(email)}
              style={{ padding:'12px 20px', borderBottom:'1px solid #F0EDE8', cursor:'pointer', background:selected?.id===email.id?'#EDE9E3':'white' }}>
              <div style={{ display:'flex', justifyContent:'space-between', marginBottom:3 }}>
                <div style={{ fontSize:12, fontWeight:email.is_unread?600:400, color:'#1C1814', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', maxWidth:180 }}>{email.from_name}</div>
                <div style={{ fontSize:10, color:'#8A8178', flexShrink:0 }}>{email.date}</div>
              </div>
              <div style={{ fontSize:12, color:'#3A3530', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', fontWeight:email.is_unread?500:400 }}>{email.subject}</div>
              <div style={{ fontSize:11, color:'#8A8178', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', marginTop:2 }}>{email.snippet}</div>
              {email.is_unread && <div style={{ width:6, height:6, borderRadius:'50%', background:'#C9A96E', marginTop:4 }}/>}
            </div>
          ))}
        </div>
      </div>

      {/* Email détail */}
      <div style={{ flex:1, overflow:'auto', padding:selected?'28px 32px':0, display:'flex', flexDirection:'column', background:'white' }}>
        {!selected ? (
          <div style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center', color:'#8A8178', fontSize:13 }}>Sélectionnez un email</div>
        ) : (
          <>
            <div style={{ marginBottom:20, paddingBottom:16, borderBottom:'1px solid #EAE6E1' }}>
              <div style={{ fontSize:20, fontWeight:600, color:'#1C1814', marginBottom:8, fontFamily:"'Cormorant Garamond',serif" }}>{selected.subject}</div>
              <div style={{ fontSize:12, color:'#8A8178' }}>De : <strong style={{ color:'#1C1814' }}>{selected.from_name}</strong> &lt;{selected.from_email}&gt;</div>
              <div style={{ fontSize:11, color:'#8A8178', marginTop:4 }}>{selected.date}</div>
            </div>
            <div style={{ fontSize:13, color:'#1C1814', lineHeight:1.8, whiteSpace:'pre-wrap' }}>{selected.body||selected.snippet}</div>
          </>
        )}
      </div>
    </div>
  )
}
