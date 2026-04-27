'use client';
import React, { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { useSession, signIn } from 'next-auth/react';

export default function AcceptInvitePage() {
  const router = useRouter();
  const params = useParams() as { token: string };
  const token = params.token;
  const { data: session, status } = useSession();
  
  const [validation, setValidation] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [accepting, setAccepting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Valider le token au chargement
  useEffect(() => {
    if (!token) return;
    fetch(`/api/invitations/accept?token=${encodeURIComponent(token)}`)
      .then(r => r.json())
      .then(data => {
        setValidation(data);
        setLoading(false);
      })
      .catch(err => {
        setError('Impossible de vérifier l\'invitation');
        setLoading(false);
      });
  }, [token]);

  const handleAccept = async () => {
    setAccepting(true);
    setError(null);
    try {
      const r = await fetch('/api/invitations/accept', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.message || data.error || 'Erreur acceptation');
      router.push('/mails');
    } catch (err: any) {
      setError(err.message);
      setAccepting(false);
    }
  };

  const containerStyle: React.CSSProperties = {
    minHeight: '100vh',
    background: '#f5f1eb',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  };
  const cardStyle: React.CSSProperties = {
    background: '#fff',
    borderRadius: 12,
    padding: 40,
    maxWidth: 480,
    width: '100%',
    boxShadow: '0 4px 16px rgba(0,0,0,0.06)',
    textAlign: 'center',
  };

  if (loading) return <div style={containerStyle}><div style={cardStyle}>Vérification de l'invitation…</div></div>;

  // Token invalide / expiré / déjà utilisé
  if (!validation?.valid) {
    const reasonLabel: Record<string, string> = {
      not_found: 'Lien d\'invitation invalide.',
      expired: 'Cette invitation a expiré (valable 7 jours).',
      accepted: 'Cette invitation a déjà été acceptée.',
      cancelled: 'Cette invitation a été annulée.',
    };
    return (
      <div style={containerStyle}>
        <div style={cardStyle}>
          <div style={{fontSize: 48, marginBottom: 16}}>⚠️</div>
          <h1 style={{fontSize: 20, fontWeight: 600, marginBottom: 12}}>Invitation indisponible</h1>
          <p style={{color: '#5a4d3a', marginBottom: 24}}>
            {reasonLabel[validation?.reason] || 'Impossible d\'utiliser cette invitation.'}
          </p>
          <button onClick={() => router.push('/')} style={btnSecondary}>Retour à l'accueil</button>
        </div>
      </div>
    );
  }

  const inv = validation.invitation;
  const org = validation.org;
  const inviter = validation.inviter;
  const roleLabel: Record<string, string> = {
    super_admin: 'Super-administrateur',
    admin: 'Administrateur',
    manager: 'Manager',
    lecture: 'Lecture seule',
  };

  // Pas connecté → demander login Google
  if (status === 'unauthenticated') {
    return (
      <div style={containerStyle}>
        <div style={cardStyle}>
          <div style={{fontSize: 28, fontWeight: 600, color: '#8b6f47', letterSpacing: 1, marginBottom: 4}}>ARCHANGE</div>
          <div style={{fontSize: 13, color: '#8a7a64', marginBottom: 24}}>Invitation à rejoindre une organisation</div>
          <h1 style={{fontSize: 22, fontWeight: 600, marginBottom: 12}}>Bienvenue sur ARCHANGE</h1>
          <p style={{color: '#5a4d3a', lineHeight: 1.6, marginBottom: 8}}>
            <strong>{inviter?.name || inviter?.email || 'Quelqu\'un'}</strong> vous invite à rejoindre
          </p>
          <p style={{color: '#8b6f47', fontSize: 22, fontWeight: 600, margin: '8px 0 4px'}}>{org?.nom || '—'}</p>
          <p style={{color: '#8a7a64', fontSize: 13, marginBottom: 24}}>en tant que <strong>{roleLabel[inv.role]}</strong></p>
          <p style={{color: '#5a4d3a', fontSize: 13, lineHeight: 1.5, marginBottom: 24, padding: 12, background: '#f5f1eb', borderRadius: 8}}>
            Connectez-vous avec le compte Google : <strong>{inv.email}</strong>
          </p>
          <button onClick={() => signIn('google', { callbackUrl: window.location.href })} style={btnPrimary}>
            Se connecter avec Google
          </button>
        </div>
      </div>
    );
  }

  if (status === 'loading') return <div style={containerStyle}><div style={cardStyle}>Chargement…</div></div>;

  // Connecté mais avec mauvais email
  const sessionEmail = session?.user?.email?.toLowerCase();
  if (sessionEmail && sessionEmail !== inv.email.toLowerCase()) {
    return (
      <div style={containerStyle}>
        <div style={cardStyle}>
          <div style={{fontSize: 48, marginBottom: 16}}>🔒</div>
          <h1 style={{fontSize: 20, fontWeight: 600, marginBottom: 12}}>Mauvais compte</h1>
          <p style={{color: '#5a4d3a', lineHeight: 1.6, marginBottom: 8}}>
            Cette invitation a été envoyée à
          </p>
          <p style={{fontWeight: 600, color: '#8b6f47', marginBottom: 16}}>{inv.email}</p>
          <p style={{color: '#5a4d3a', marginBottom: 24, fontSize: 14}}>
            Vous êtes connecté avec <strong>{sessionEmail}</strong>.<br/>
            Déconnectez-vous puis reconnectez-vous avec le bon compte.
          </p>
          <button onClick={() => router.push('/api/auth/signout')} style={btnPrimary}>Se déconnecter</button>
        </div>
      </div>
    );
  }

  // Connecté avec le bon email → afficher l'invitation
  return (
    <div style={containerStyle}>
      <div style={cardStyle}>
        <div style={{fontSize: 28, fontWeight: 600, color: '#8b6f47', letterSpacing: 1, marginBottom: 4}}>ARCHANGE</div>
        <div style={{fontSize: 13, color: '#8a7a64', marginBottom: 24}}>Invitation à rejoindre une organisation</div>
        <h1 style={{fontSize: 22, fontWeight: 600, marginBottom: 8}}>Rejoindre {org?.nom}</h1>
        <p style={{color: '#5a4d3a', lineHeight: 1.6, marginBottom: 4}}>
          Invité par <strong>{inviter?.name || inviter?.email}</strong>
        </p>
        <p style={{color: '#8a7a64', fontSize: 14, marginBottom: 24}}>
          Rôle : <strong style={{color: '#8b6f47'}}>{roleLabel[inv.role]}</strong>
        </p>
        {error && (
          <div style={{background:'#fdeded',color:'#a83232',padding:'10px 14px',borderRadius:8,fontSize:13,marginBottom:16}}>
            ⚠️ {error}
          </div>
        )}
        <div style={{display:'flex',gap:12,justifyContent:'center'}}>
          <button onClick={() => router.push('/')} disabled={accepting} style={btnSecondary}>
            Refuser
          </button>
          <button onClick={handleAccept} disabled={accepting} style={btnPrimary}>
            {accepting ? 'Acceptation…' : 'Accepter'}
          </button>
        </div>
      </div>
    </div>
  );
}

const btnPrimary: React.CSSProperties = {
  padding: '12px 28px',
  background: '#8b6f47',
  color: '#fff',
  border: 'none',
  borderRadius: 8,
  cursor: 'pointer',
  fontSize: 14,
  fontWeight: 600,
  fontFamily: 'inherit',
};
const btnSecondary: React.CSSProperties = {
  padding: '12px 24px',
  background: 'transparent',
  color: '#8a7a64',
  border: '1px solid #ede5d6',
  borderRadius: 8,
  cursor: 'pointer',
  fontSize: 14,
  fontFamily: 'inherit',
};
