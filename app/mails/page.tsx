'use client'
import { AppLayout } from '@/components/layout/AppLayout'
import { useEmails } from '@/hooks/useEmails'
import { useState } from 'react'

export default function MailsPage() {
  const { emails, loading, syncNow, unreadCount } = useEmails()
  const [selected, setSelected] = useState<string | null>(null)

  const selectedEmail = emails.find(e => e.id === selected)

  return (
    <AppLayout badges={{ '/mails': unreadCount }}>
      <div style={{ display:'flex', flex:1, overflow:'hidden', height:'100%' }}>
        
        {/* Liste emails */}
        <div style={{ width:340, borderRight:'1px solid #EAE6E1', display:'flex', flexDirection:'column', overflow:'hidden', flexShrink:0 }}>
          <div style={{ padding:'16px 20px 12px', borderBottom:'1px solid #EAE6E1', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
            <div style={{ fontSize:13, fontWeight:600, color:'#1C1814' }}>Mails <span style={{ fontSize:11, color:'#8A8178', fontWeight:400 }}>({emails.length})</span></div>
            <button onClick={syncNow} style={{ fontSize:11, color:'#C9A96E', background:'none', border:'1px solid #EAE6E1', borderRadius:6, padding:'4px 10px', cursor:'pointer' }}>
              ↻ Sync
            </button>
          </div>
          
          {loading ? (
            <div style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center', color:'#8A8178', fontSize:13 }}>
              Chargement...
            </div>
          ) : emails.length === 0 ? (
            <div style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center', color:'#8A8178', fontSize:13 }}>
              Aucun email
            </div>
          ) : (
            <div style={{ flex:1, overflowY:'auto' }}>
              {emails.map(email => (
                <div key={email.id} onClick={() => setSelected(email.id)}
                  style={{ padding:'12px 20px', borderBottom:'1px solid #F5F3EF', cursor:'pointer', background: selected === email.id ? '#F5F3EF' : 'white', transition:'background .1s' }}>
                  <div style={{ display:'flex', justifyContent:'space-between', marginBottom:3 }}>
                    <div style={{ fontSize:12, fontWeight: email.is_unread ? 600 : 400, color:'#1C1814', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', maxWidth:200 }}>
                      {email.from_name}
                    </div>
                    <div style={{ fontSize:10, color:'#8A8178', flexShrink:0 }}>{email.date}</div>
                  </div>
                  <div style={{ fontSize:12, color:'#1C1814', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', marginBottom:3, fontWeight: email.is_unread ? 500 : 400 }}>
                    {email.subject}
                  </div>
                  <div style={{ fontSize:11, color:'#8A8178', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                    {email.snippet}
                  </div>
                  {email.is_unread && <div style={{ width:6, height:6, borderRadius:'50%', background:'#C9A96E', marginTop:4 }}/>}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Panneau email sélectionné */}
        <div style={{ flex:1, overflow:'auto', padding: selectedEmail ? '24px 32px' : 0, display:'flex', flexDirection:'column' }}>
          {!selectedEmail ? (
            <div style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center', color:'#8A8178', fontSize:13 }}>
              Sélectionnez un email
            </div>
          ) : (
            <>
              <div style={{ marginBottom:20 }}>
                <div style={{ fontSize:18, fontWeight:600, color:'#1C1814', marginBottom:8 }}>{selectedEmail.subject}</div>
                <div style={{ fontSize:12, color:'#8A8178' }}>
                  De : <strong style={{ color:'#1C1814' }}>{selectedEmail.from_name}</strong> &lt;{selectedEmail.from_email}&gt; · {selectedEmail.date}
                </div>
              </div>
              <div style={{ fontSize:13, color:'#1C1814', lineHeight:1.7, whiteSpace:'pre-wrap', flex:1 }}>
                {selectedEmail.body || selectedEmail.snippet}
              </div>
            </>
          )}
        </div>
      </div>
    </AppLayout>
  )
}
