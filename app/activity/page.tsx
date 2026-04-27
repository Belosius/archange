'use client';
import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';

const ACTION_LABELS: Record<string,{label:string,icon:string,color:string}> = {
  'org.created': { label: 'Organisation créée', icon: '🏢', color: '#8b6f47' },
  'org.switched': { label: 'Changement d\'organisation', icon: '🔄', color: '#8a7a64' },
  'org.updated': { label: 'Organisation modifiée', icon: '✏️', color: '#8b6f47' },
  'member.invited': { label: 'Invitation envoyée', icon: '📧', color: '#a98c5a' },
  'member.joined': { label: 'A rejoint', icon: '✅', color: '#5e8c5a' },
  'member.removed': { label: 'Membre retiré', icon: '👋', color: '#a83232' },
  'member.role_changed': { label: 'Rôle modifié', icon: '🔧', color: '#8a7a64' },
  'invitation.cancelled': { label: 'Invitation annulée', icon: '🚫', color: '#a89876' },
  'invitation.expired': { label: 'Invitation expirée', icon: '⏰', color: '#a89876' },
  'sources.modified': { label: 'Sources ARCHANGE modifiées', icon: '📚', color: '#8b6f47' },
  'email.sent': { label: 'Email envoyé', icon: '📤', color: '#5e8c5a' },
  'email.deleted': { label: 'Email supprimé', icon: '🗑️', color: '#a89876' },
  'gmail.connected': { label: 'Gmail connecté', icon: '📬', color: '#5e8c5a' },
  'gmail.disconnected': { label: 'Gmail déconnecté', icon: '📭', color: '#a89876' },
};

export default function ActivityPage() {
  const router = useRouter();
  const { status } = useSession();
  const [activities, setActivities] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState<string|null>(null);
  const [filter, setFilter] = useState<string>('');

  useEffect(() => { if (status === 'unauthenticated') router.replace('/'); }, [status, router]);

  const load = async (before?: string) => {
    if (!before) setLoading(true);
    try {
      const params = new URLSearchParams({ limit: '50' });
      if (before) params.set('before', before);
      if (filter) params.set('action', filter);
      const r = await fetch(`/api/activity?${params}`);
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      setActivities(prev => before ? [...prev, ...d.activities] : d.activities);
      setHasMore(d.hasMore);
    } catch (e: any) { setError(e.message); }
    setLoading(false);
  };

  useEffect(() => { if (status === 'authenticated') load(); }, [status, filter]);

  const fmtTime = (iso: string) => {
    const d = new Date(iso);
    const now = new Date();
    const diff = now.getTime() - d.getTime();
    if (diff < 60_000) return 'à l\'instant';
    if (diff < 3600_000) return Math.floor(diff/60_000) + ' min';
    if (diff < 86400_000) return Math.floor(diff/3600_000) + ' h';
    return d.toLocaleDateString('fr-FR') + ' ' + d.toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'});
  };

  const renderMeta = (a: any) => {
    const m = a.metadata || {};
    if (a.action === 'member.invited') return <span style={metaText}>→ {m.email} ({m.role})</span>;
    if (a.action === 'member.joined') return <span style={metaText}>{m.email} ({m.role})</span>;
    if (a.action === 'member.role_changed') return <span style={metaText}>{m.oldRole} → {m.newRole}</span>;
    if (a.action === 'sources.modified') return <span style={metaText}>{(m.fields||[]).slice(0,3).join(', ')}{(m.fields||[]).length>3?'…':''}</span>;
    if (a.action === 'email.sent') return <span style={metaText}>→ {m.to}</span>;
    if (a.action === 'invitation.cancelled') return <span style={metaText}>{m.email}</span>;
    if (a.action === 'org.created') return <span style={metaText}>{m.nom}</span>;
    return null;
  };

  return (
    <div style={{minHeight:'100vh',background:'#f5f1eb'}}>
      <div style={{maxWidth:840,margin:'0 auto',padding:'40px 24px'}}>
        <div style={{marginBottom:24}}>
          <button onClick={()=>router.push('/mails')} style={{background:'none',border:'none',color:'#8a7a64',cursor:'pointer',fontSize:13,marginBottom:8,padding:0}}>← Retour</button>
          <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:16,flexWrap:'wrap'}}>
            <div>
              <h1 style={{fontSize:26,fontWeight:600,color:'#2c2419',margin:0}}>Journal d'activité</h1>
              <p style={{color:'#8a7a64',marginTop:4,fontSize:14}}>Toutes les actions effectuées dans l'organisation</p>
            </div>
            <select value={filter} onChange={e=>setFilter(e.target.value)} style={{padding:'8px 12px',border:'1px solid #ede5d6',borderRadius:8,fontSize:13,background:'#fff',fontFamily:'inherit',cursor:'pointer'}}>
              <option value="">Tous les événements</option>
              <option value="member.invited">Invitations</option>
              <option value="member.joined">Adhésions</option>
              <option value="member.removed">Retraits</option>
              <option value="member.role_changed">Changements de rôle</option>
              <option value="sources.modified">Sources ARCHANGE</option>
              <option value="email.sent">Emails envoyés</option>
              <option value="org.created">Création d'org</option>
            </select>
          </div>
        </div>

        {error && <div style={{background:'#fdeded',color:'#a83232',padding:'10px 14px',borderRadius:8,fontSize:13,marginBottom:16}}>⚠️ {error}</div>}

        {loading && activities.length === 0 ? (
          <div style={{padding:40,textAlign:'center',color:'#8a7a64'}}>Chargement…</div>
        ) : activities.length === 0 ? (
          <div style={{padding:40,textAlign:'center',color:'#8a7a64',background:'#fff',borderRadius:12}}>
            <div style={{fontSize:36,marginBottom:8}}>📋</div>
            Aucune activité {filter ? 'pour ce filtre' : 'enregistrée pour le moment'}.
          </div>
        ) : (
          <div style={{background:'#fff',borderRadius:12,overflow:'hidden',boxShadow:'0 1px 4px rgba(0,0,0,0.04)'}}>
            {activities.map((a, i) => {
              const def = ACTION_LABELS[a.action] || { label: a.action, icon: '•', color: '#8a7a64' };
              return (
                <div key={a.id} style={{display:'flex',alignItems:'flex-start',gap:14,padding:'14px 18px',borderBottom: i<activities.length-1 ? '1px solid #f5f1eb' : 'none'}}>
                  <div style={{width:32,height:32,borderRadius:8,background:'#f5f1eb',display:'flex',alignItems:'center',justifyContent:'center',fontSize:16,flexShrink:0}}>{def.icon}</div>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{fontSize:14,color:'#2c2419'}}>
                      <strong>{a.user?.name || a.user?.email || 'Système'}</strong>
                      {' — '}
                      <span style={{color:def.color,fontWeight:500}}>{def.label}</span>
                      {' '}{renderMeta(a)}
                    </div>
                    <div style={{fontSize:12,color:'#a89876',marginTop:2}}>{fmtTime(a.createdAt)}</div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {hasMore && (
          <div style={{textAlign:'center',marginTop:16}}>
            <button onClick={()=>load(activities[activities.length-1]?.createdAt)} style={{padding:'10px 24px',background:'#fff',color:'#8b6f47',border:'1px solid #ede5d6',borderRadius:8,cursor:'pointer',fontSize:13,fontWeight:500,fontFamily:'inherit'}}>
              Charger plus
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

const metaText: React.CSSProperties = { color: '#8a7a64', fontSize: 13 };
