'use client';
import React, { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';

interface Org { id: string; nom: string; slug: string; type: string; role: string; }

export default function OrgSwitcher({ collapsed = false }: { collapsed?: boolean }) {
  const router = useRouter();
  const [orgs, setOrgs] = useState<Org[]>([]);
  const [activeOrgId, setActiveOrgId] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [switching, setSwitching] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch('/api/orgs').then(r => r.json()).then(d => {
      setOrgs(d.orgs || []);
      setActiveOrgId(d.activeOrgId);
    }).catch(() => {});
  }, []);

  // Fermer si click outside
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const switchOrg = async (orgId: string) => {
    if (orgId === activeOrgId) { setOpen(false); return; }
    setSwitching(true);
    try {
      const r = await fetch('/api/orgs/switch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orgId }),
      });
      if (r.ok) {
        // Reload pour recharger toutes les données dans le contexte de la nouvelle org
        window.location.reload();
      }
    } catch {}
    setSwitching(false);
  };

  if (!orgs || orgs.length === 0) return null;

  const activeOrg = orgs.find(o => o.id === activeOrgId) || orgs[0];

  // Mode collapsed (sidebar réduite)
  if (collapsed) {
    return (
      <div ref={ref} style={{position:'relative'}}>
        <button onClick={() => setOpen(!open)} title={activeOrg.nom} style={{
          width:36,height:36,borderRadius:8,border:'1px solid #ede5d6',background:'#fff',
          color:'#8b6f47',fontWeight:600,cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',fontSize:14
        }}>
          {activeOrg.nom[0].toUpperCase()}
        </button>
        {open && renderMenu()}
      </div>
    );
  }

  // Mode normal
  return (
    <div ref={ref} style={{position:'relative',padding:'8px'}}>
      <button onClick={() => setOpen(!open)} disabled={switching} style={{
        width:'100%',display:'flex',alignItems:'center',gap:10,padding:'8px 10px',
        background:open?'#f5f1eb':'transparent',border:'1px solid #ede5d6',borderRadius:8,
        cursor:switching?'wait':'pointer',fontFamily:'inherit',color:'#2c2419',textAlign:'left'
      }}>
        <div style={{width:28,height:28,borderRadius:6,background:'#8b6f47',color:'#fff',display:'flex',alignItems:'center',justifyContent:'center',fontWeight:600,fontSize:13,flexShrink:0}}>
          {activeOrg.nom[0].toUpperCase()}
        </div>
        <div style={{flex:1,minWidth:0}}>
          <div style={{fontSize:13,fontWeight:600,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{activeOrg.nom}</div>
          <div style={{fontSize:11,color:'#8a7a64'}}>{orgs.length > 1 ? `${orgs.length} organisations` : 'Mon organisation'}</div>
        </div>
        <span style={{fontSize:10,color:'#8a7a64',transform:open?'rotate(180deg)':'none',transition:'transform .15s'}}>▼</span>
      </button>
      {open && renderMenu()}
    </div>
  );

  function renderMenu() {
    return (
      <div style={{
        position:'absolute',top:'calc(100% + 4px)',left:8,right:8,
        background:'#fff',border:'1px solid #ede5d6',borderRadius:8,
        boxShadow:'0 4px 16px rgba(0,0,0,0.08)',zIndex:1000,padding:6,
        ...(collapsed ? {left:'calc(100% + 8px)',right:'auto',top:0,minWidth:200} : {})
      }}>
        <div style={{fontSize:11,color:'#a89876',padding:'6px 10px',textTransform:'uppercase',letterSpacing:0.5,fontWeight:600}}>
          Mes organisations
        </div>
        {orgs.map(org => (
          <button key={org.id} onClick={()=>switchOrg(org.id)} style={{
            width:'100%',display:'flex',alignItems:'center',gap:10,padding:'8px 10px',
            background:org.id===activeOrgId?'#f5f1eb':'transparent',border:'none',borderRadius:6,
            cursor:'pointer',fontFamily:'inherit',color:'#2c2419',textAlign:'left',marginBottom:2
          }}
          onMouseEnter={e=>{if(org.id!==activeOrgId)(e.currentTarget as HTMLElement).style.background='#fafaf6'}}
          onMouseLeave={e=>{if(org.id!==activeOrgId)(e.currentTarget as HTMLElement).style.background='transparent'}}>
            <div style={{width:24,height:24,borderRadius:5,background:'#8b6f47',color:'#fff',display:'flex',alignItems:'center',justifyContent:'center',fontWeight:600,fontSize:11,flexShrink:0}}>
              {org.nom[0].toUpperCase()}
            </div>
            <div style={{flex:1,minWidth:0}}>
              <div style={{fontSize:13,fontWeight:500,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{org.nom}</div>
              <div style={{fontSize:10,color:'#8a7a64'}}>{org.role}</div>
            </div>
            {org.id===activeOrgId && <span style={{color:'#5e8c5a',fontSize:14}}>✓</span>}
          </button>
        ))}
        <div style={{borderTop:'1px solid #f5f1eb',marginTop:6,paddingTop:6}}>
          <button onClick={()=>{setOpen(false);router.push('/onboarding/new-org');}} style={menuItem}>
            <span style={{fontSize:14}}>+</span> Nouvelle organisation
          </button>
          <button onClick={()=>{setOpen(false);router.push('/settings/team');}} style={menuItem}>
            <span style={{fontSize:14}}>👥</span> Équipe
          </button>
          <button onClick={()=>{setOpen(false);router.push('/activity');}} style={menuItem}>
            <span style={{fontSize:14}}>📋</span> Journal d'activité
          </button>
        </div>
      </div>
    );
  }
}

const menuItem: React.CSSProperties = {
  width:'100%',display:'flex',alignItems:'center',gap:10,padding:'8px 10px',
  background:'transparent',border:'none',borderRadius:6,cursor:'pointer',
  fontFamily:'inherit',fontSize:13,color:'#5a4d3a',textAlign:'left'
};
