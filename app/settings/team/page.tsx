'use client';
import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';

const ROLE_LABELS: Record<string,string> = {
  super_admin: 'Super-admin',
  admin: 'Administrateur',
  manager: 'Manager',
  lecture: 'Lecture seule',
};

export default function TeamPage() {
  const router = useRouter();
  const { status } = useSession();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [showInvite, setShowInvite] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState('manager');
  const [inviting, setInviting] = useState(false);
  const [inviteResult, setInviteResult] = useState<any>(null);
  const [error, setError] = useState<string|null>(null);

  useEffect(() => { if (status === 'unauthenticated') router.replace('/'); }, [status, router]);

  const load = async () => {
    setLoading(true);
    try {
      const r = await fetch('/api/team');
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      setData(d);
    } catch (e: any) { setError(e.message); }
    setLoading(false);
  };

  useEffect(() => { if (status === 'authenticated') load(); }, [status]);

  const sendInvite = async () => {
    if (!inviteEmail.trim()) return;
    setInviting(true);
    setError(null);
    setInviteResult(null);
    try {
      const r = await fetch('/api/invitations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: inviteEmail.trim(), role: inviteRole }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      setInviteResult(d);
      setInviteEmail('');
      await load();
    } catch (e: any) { setError(e.message); }
    setInviting(false);
  };

  const cancelInvite = async (id: string) => {
    if (!confirm('Annuler cette invitation ?')) return;
    await fetch(`/api/invitations?id=${id}`, { method: 'DELETE' });
    await load();
  };

  const removeMember = async (membershipId: string, name: string) => {
    if (!confirm(`Retirer ${name} de l'équipe ?`)) return;
    const r = await fetch(`/api/team/${membershipId}`, { method: 'DELETE' });
    if (!r.ok) {
      const d = await r.json();
      alert(d.error || 'Erreur');
    }
    await load();
  };

  const changeRole = async (membershipId: string, newRole: string) => {
    const r = await fetch(`/api/team/${membershipId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role: newRole }),
    });
    if (!r.ok) { const d = await r.json(); alert(d.error || 'Erreur'); }
    await load();
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    alert('Lien copié !');
  };

  if (loading) return <div style={pageStyle}><div style={{padding:40,textAlign:'center',color:'#8a7a64'}}>Chargement…</div></div>;

  return (
    <div style={pageStyle}>
      <div style={{maxWidth:840,margin:'0 auto',padding:'40px 24px'}}>
        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:24}}>
          <div>
            <button onClick={() => router.push('/mails')} style={{background:'none',border:'none',color:'#8a7a64',cursor:'pointer',fontSize:13,marginBottom:8,padding:0}}>
              ← Retour
            </button>
            <h1 style={{fontSize:26,fontWeight:600,color:'#2c2419',margin:0}}>Équipe</h1>
            <p style={{color:'#8a7a64',marginTop:4,fontSize:14}}>Gérer les membres et invitations de l'organisation</p>
          </div>
          {data?.canInvite && (
            <button onClick={() => setShowInvite(true)} style={btnPrimary}>+ Inviter un membre</button>
          )}
        </div>

        {error && (
          <div style={{background:'#fdeded',color:'#a83232',padding:'10px 14px',borderRadius:8,fontSize:13,marginBottom:16}}>⚠️ {error}</div>
        )}

        {showInvite && (
          <div style={{...cardStyle,marginBottom:24}}>
            <h2 style={{fontSize:16,fontWeight:600,marginTop:0,marginBottom:16}}>Inviter un nouveau membre</h2>
            <div style={{display:'flex',gap:12,alignItems:'flex-end',flexWrap:'wrap'}}>
              <div style={{flex:'1 1 240px'}}>
                <label style={labelStyle}>Email Google</label>
                <input type="email" value={inviteEmail} onChange={e=>setInviteEmail(e.target.value)}
                  placeholder="ex: marie@gmail.com" style={inputStyle}/>
              </div>
              <div style={{flex:'0 0 180px'}}>
                <label style={labelStyle}>Rôle</label>
                <select value={inviteRole} onChange={e=>setInviteRole(e.target.value)} style={inputStyle}>
                  <option value="manager">Manager (peut répondre)</option>
                  <option value="admin">Administrateur</option>
                  <option value="lecture">Lecture seule</option>
                </select>
              </div>
              <button onClick={sendInvite} disabled={inviting||!inviteEmail.trim()} style={btnPrimary}>
                {inviting?'Envoi…':'Envoyer'}
              </button>
              <button onClick={()=>{setShowInvite(false);setInviteResult(null);}} style={btnSecondary}>Fermer</button>
            </div>
            {inviteResult && (
              <div style={{marginTop:16,padding:12,background:inviteResult.emailSent?'#e8f5e9':'#fff8e1',borderRadius:8,fontSize:13}}>
                {inviteResult.emailSent ? (
                  <>✅ Email envoyé à <strong>{inviteResult.invitation.email}</strong>. L'invitation expire dans 7 jours.</>
                ) : (
                  <>
                    ⚠️ <strong>L'email n'a pas pu être envoyé</strong> ({inviteResult.emailError || 'erreur inconnue'}).<br/>
                    Copiez ce lien et envoyez-le manuellement (WhatsApp/SMS) :<br/>
                    <code style={{display:'block',marginTop:8,padding:8,background:'#fff',borderRadius:4,wordBreak:'break-all',fontSize:11}}>{inviteResult.acceptUrl}</code>
                    <button onClick={()=>copyToClipboard(inviteResult.acceptUrl)} style={{...btnPrimary,marginTop:8,padding:'6px 14px',fontSize:12}}>Copier le lien</button>
                  </>
                )}
              </div>
            )}
          </div>
        )}

        <h2 style={sectionTitle}>Membres ({data?.members?.length || 0})</h2>
        <div style={cardStyle}>
          {(data?.members || []).map((m: any) => (
            <div key={m.membershipId} style={memberRow}>
              <div style={{display:'flex',alignItems:'center',gap:12,flex:1,minWidth:0}}>
                {m.image ? (
                  <img src={m.image} alt="" style={{width:36,height:36,borderRadius:'50%',flexShrink:0}}/>
                ) : (
                  <div style={{width:36,height:36,borderRadius:'50%',background:'#ede5d6',display:'flex',alignItems:'center',justifyContent:'center',color:'#8b6f47',fontWeight:600,flexShrink:0}}>
                    {(m.name||m.email||'?')[0].toUpperCase()}
                  </div>
                )}
                <div style={{minWidth:0,flex:1}}>
                  <div style={{fontWeight:500,color:'#2c2419',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>
                    {m.name || m.email} {m.isMe && <span style={{fontSize:11,color:'#8b6f47',marginLeft:6}}>(moi)</span>}
                  </div>
                  <div style={{fontSize:12,color:'#8a7a64',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{m.email}</div>
                </div>
              </div>
              <div style={{display:'flex',alignItems:'center',gap:12}}>
                {data?.canManage && !m.isMe ? (
                  <select value={m.role} onChange={e=>changeRole(m.membershipId,e.target.value)} style={{...inputStyle,padding:'6px 10px',fontSize:12,width:'auto'}}>
                    <option value="lecture">Lecture seule</option>
                    <option value="manager">Manager</option>
                    <option value="admin">Administrateur</option>
                    {data?.myRole === 'super_admin' && <option value="super_admin">Super-admin</option>}
                  </select>
                ) : (
                  <span style={{fontSize:12,color:'#8b6f47',background:'#f5f1eb',padding:'4px 10px',borderRadius:6,fontWeight:500}}>{ROLE_LABELS[m.role]}</span>
                )}
                {data?.canManage && !m.isMe && (
                  <button onClick={()=>removeMember(m.membershipId,m.name||m.email)} title="Retirer" style={iconBtn}>✕</button>
                )}
              </div>
            </div>
          ))}
        </div>

        {data?.invitations?.length > 0 && (
          <>
            <h2 style={sectionTitle}>Invitations en attente ({data.invitations.length})</h2>
            <div style={cardStyle}>
              {data.invitations.map((inv: any) => (
                <div key={inv.id} style={memberRow}>
                  <div style={{display:'flex',alignItems:'center',gap:12,flex:1,minWidth:0}}>
                    <div style={{width:36,height:36,borderRadius:'50%',background:'#fff8e1',display:'flex',alignItems:'center',justifyContent:'center',fontSize:18}}>📧</div>
                    <div style={{minWidth:0,flex:1}}>
                      <div style={{fontWeight:500,color:'#2c2419'}}>{inv.email}</div>
                      <div style={{fontSize:12,color:'#8a7a64'}}>
                        Envoyée {new Date(inv.created_at).toLocaleDateString('fr-FR')} • Expire {new Date(inv.expires_at).toLocaleDateString('fr-FR')}
                      </div>
                    </div>
                  </div>
                  <div style={{display:'flex',alignItems:'center',gap:12}}>
                    <span style={{fontSize:12,color:'#8b6f47',background:'#f5f1eb',padding:'4px 10px',borderRadius:6,fontWeight:500}}>{ROLE_LABELS[inv.role]}</span>
                    {data?.canInvite && <button onClick={()=>cancelInvite(inv.id)} title="Annuler" style={iconBtn}>✕</button>}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

const pageStyle: React.CSSProperties = { minHeight:'100vh', background:'#f5f1eb' };
const cardStyle: React.CSSProperties = { background:'#fff', borderRadius:12, padding:8, boxShadow:'0 1px 4px rgba(0,0,0,0.04)' };
const sectionTitle: React.CSSProperties = { fontSize:14, fontWeight:600, color:'#5a4d3a', textTransform:'uppercase', letterSpacing:0.5, marginTop:32, marginBottom:12 };
const memberRow: React.CSSProperties = { display:'flex', alignItems:'center', justifyContent:'space-between', padding:12, borderRadius:8 };
const inputStyle: React.CSSProperties = { width:'100%', padding:'10px 12px', border:'1px solid #ede5d6', borderRadius:8, fontSize:14, background:'#fafaf6', fontFamily:'inherit', outline:'none' };
const labelStyle: React.CSSProperties = { display:'block', fontSize:12, fontWeight:500, color:'#5a4d3a', marginBottom:4 };
const btnPrimary: React.CSSProperties = { padding:'10px 20px', background:'#8b6f47', color:'#fff', border:'none', borderRadius:8, cursor:'pointer', fontSize:13, fontWeight:600, fontFamily:'inherit', whiteSpace:'nowrap' };
const btnSecondary: React.CSSProperties = { padding:'10px 16px', background:'transparent', color:'#8a7a64', border:'1px solid #ede5d6', borderRadius:8, cursor:'pointer', fontSize:13, fontFamily:'inherit' };
const iconBtn: React.CSSProperties = { width:28, height:28, borderRadius:6, border:'none', background:'transparent', color:'#a89876', cursor:'pointer', fontSize:14 };
