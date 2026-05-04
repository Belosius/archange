'use client';
/**
 * ═══════════════════════════════════════════════════════════════
 * /invite/[token] — Landing page d'acceptation d'invitation
 * ═══════════════════════════════════════════════════════════════
 *
 * Flow :
 * 1. Page charge le token depuis l'URL → GET /api/invitations/[token]
 * 2. Si user pas connecté → bouton "Se connecter avec Google"
 *    (le callback ramène ici, on retente automatiquement)
 * 3. Si user connecté avec le bon email → POST accept → redirect /mails
 * 4. Si email ne match pas → message clair pour changer de compte Google
 */
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useSession, signIn } from 'next-auth/react';
import { invalidateActiveOrgCache } from '@/lib/api-fetch';

const ROLE_LABELS: Record<string, string> = {
  admin: 'Administrateur',
  manager: 'Gestionnaire',
  lecture: 'Lecture seule',
};

interface InvitationInfo {
  email: string;
  role: string;
  orgName: string;
  invitedByName: string;
  expiresAt: string;
}

export default function InvitePage({ params }: { params: { token: string } }) {
  const { token } = params;
  const router = useRouter();
  const { data: session, status } = useSession();

  const [info, setInfo] = useState<InvitationInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [accepting, setAccepting] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    fetch(`/api/invitations/${token}`)
      .then(async (r) => {
        const data = await r.json();
        if (!r.ok) {
          setError(data.error || 'Invitation invalide');
        } else {
          setInfo(data.invitation);
        }
      })
      .catch(() => setError('Erreur réseau'))
      .finally(() => setLoaded(true));
  }, [token]);

  const accept = async () => {
    setAccepting(true);
    setError(null);
    try {
      const r = await fetch(`/api/invitations/${token}`, { method: 'POST' });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || 'Acceptation échouée');
      invalidateActiveOrgCache();
      router.push('/mails');
    } catch (e: any) {
      setError(e.message || 'Erreur');
      setAccepting(false);
    }
  };

  if (!loaded) {
    return (
      <div style={containerStyle}>
        <div style={cardStyle}>
          <p style={{ color: 'var(--color-text-secondary)' }}>Chargement…</p>
        </div>
      </div>
    );
  }

  if (error && !info) {
    return (
      <div style={containerStyle}>
        <div style={cardStyle}>
          <h1 style={{ fontSize: 22, marginBottom: 12 }}>Invitation invalide</h1>
          <p style={{ color: 'var(--color-text-secondary)', marginBottom: 20 }}>{error}</p>
          <button onClick={() => router.push('/')} style={primaryBtn}>
            Retour à l'accueil
          </button>
        </div>
      </div>
    );
  }

  if (!info) return null;

  const wrongAccount =
    status === 'authenticated' &&
    session?.user?.email &&
    session.user.email.toLowerCase() !== info.email.toLowerCase();

  return (
    <div style={containerStyle}>
      <div style={cardStyle}>
        <div style={{ fontSize: 13, color: 'var(--color-text-secondary)', marginBottom: 6, letterSpacing: 0.5, textTransform: 'uppercase' }}>
          Invitation Archange
        </div>
        <h1 style={{ fontSize: 24, fontWeight: 600, marginBottom: 16 }}>
          Vous avez été invité·e à rejoindre {info.orgName}
        </h1>

        <div style={{ background: 'var(--color-bg-primary)', border: '1px solid var(--color-border)', borderRadius: 8, padding: 16, marginBottom: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
            <span style={{ color: 'var(--color-text-secondary)', fontSize: 13 }}>Invité par</span>
            <span style={{ fontSize: 13 }}>{info.invitedByName}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
            <span style={{ color: 'var(--color-text-secondary)', fontSize: 13 }}>Email cible</span>
            <span style={{ fontSize: 13, fontFamily: 'monospace' }}>{info.email}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ color: 'var(--color-text-secondary)', fontSize: 13 }}>Rôle</span>
            <span style={{ fontSize: 13 }}>{ROLE_LABELS[info.role] || info.role}</span>
          </div>
        </div>

        {status === 'unauthenticated' && (
          <>
            <p style={{ color: 'var(--color-text-secondary)', fontSize: 14, marginBottom: 16, lineHeight: 1.5 }}>
              Connectez-vous avec le compte Google <strong>{info.email}</strong> pour accepter l'invitation.
            </p>
            <button
              onClick={() => signIn('google', { callbackUrl: `/invite/${token}` })}
              style={primaryBtn}
            >
              Se connecter avec Google
            </button>
          </>
        )}

        {wrongAccount && (
          <>
            <div style={{ background: 'rgba(220,160,50,0.1)', border: '1px solid rgba(220,160,50,0.3)', padding: 12, borderRadius: 8, marginBottom: 16, fontSize: 13, lineHeight: 1.5 }}>
              Vous êtes connecté·e avec <strong>{session?.user?.email}</strong> mais l'invitation est destinée à <strong>{info.email}</strong>. Déconnectez-vous puis reconnectez-vous avec le bon compte Google.
            </div>
            <button onClick={() => signIn('google', { callbackUrl: `/invite/${token}` })} style={primaryBtn}>
              Changer de compte Google
            </button>
          </>
        )}

        {status === 'authenticated' && !wrongAccount && (
          <>
            {error && (
              <div style={{ background: 'rgba(220,50,50,0.1)', color: '#c33', padding: 10, borderRadius: 8, fontSize: 13, marginBottom: 16 }}>
                {error}
              </div>
            )}
            <button onClick={accept} disabled={accepting} style={primaryBtn}>
              {accepting ? 'Acceptation…' : `Rejoindre ${info.orgName}`}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

const containerStyle: React.CSSProperties = {
  minHeight: '100vh',
  display: 'grid',
  placeItems: 'center',
  padding: 24,
  background: 'var(--color-bg-primary)',
};

const cardStyle: React.CSSProperties = {
  width: '100%',
  maxWidth: 480,
  background: 'var(--color-bg-secondary)',
  border: '1px solid var(--color-border)',
  borderRadius: 12,
  padding: 32,
  boxShadow: '0 4px 24px rgba(0,0,0,0.06)',
};

const primaryBtn: React.CSSProperties = {
  padding: '10px 18px',
  borderRadius: 8,
  border: 'none',
  background: 'var(--color-accent, #b48c50)',
  color: 'white',
  fontSize: 14,
  fontWeight: 500,
  cursor: 'pointer',
  width: '100%',
};
