'use client';
import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';

export default function NewOrgPage() {
  const router = useRouter();
  const { data: session, status } = useSession();
  const [nom, setNom] = useState('');
  const [type, setType] = useState('brasserie');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (status === 'unauthenticated') router.replace('/');
  }, [status, router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nom.trim()) {
      setError('Le nom de l\'organisation est requis');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const r = await fetch('/api/orgs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nom: nom.trim(), type }),
      });
      if (!r.ok) {
        const data = await r.json();
        throw new Error(data.error || 'Erreur création');
      }
      // Org créée et activée — redirection vers /mails
      router.push('/mails');
    } catch (err: any) {
      setError(err.message);
      setSubmitting(false);
    }
  };

  if (status === 'loading') return <div style={{padding:40,textAlign:'center'}}>Chargement…</div>;

  return (
    <div style={{
      minHeight: '100vh',
      background: '#f5f1eb',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 24,
    }}>
      <div style={{
        background: '#fff',
        borderRadius: 12,
        padding: 40,
        maxWidth: 480,
        width: '100%',
        boxShadow: '0 4px 16px rgba(0,0,0,0.06)',
      }}>
        <div style={{textAlign: 'center', marginBottom: 32}}>
          <div style={{fontSize: 28, fontWeight: 600, color: '#8b6f47', letterSpacing: 1}}>
            ARCHANGE
          </div>
          <div style={{fontSize: 13, color: '#8a7a64', marginTop: 4}}>
            Nouvel établissement
          </div>
        </div>

        <h1 style={{fontSize: 22, fontWeight: 600, marginBottom: 8, color: '#2c2419'}}>
          Créer une organisation
        </h1>
        <p style={{color: '#5a4d3a', lineHeight: 1.5, marginBottom: 28, fontSize: 14}}>
          Vous serez automatiquement super-administrateur. Vous pourrez ensuite inviter votre équipe.
        </p>

        <form onSubmit={handleSubmit}>
          <div style={{marginBottom: 20}}>
            <label style={{display: 'block', fontSize: 13, fontWeight: 500, color: '#5a4d3a', marginBottom: 6}}>
              Nom de l'établissement
            </label>
            <input
              type="text"
              value={nom}
              onChange={(e) => setNom(e.target.value)}
              placeholder="ex. La Rêverie"
              autoFocus
              required
              style={{
                width: '100%',
                padding: '10px 14px',
                border: '1px solid #ede5d6',
                borderRadius: 8,
                fontSize: 15,
                outline: 'none',
                background: '#fafaf6',
                fontFamily: 'inherit',
              }}
            />
          </div>

          <div style={{marginBottom: 28}}>
            <label style={{display: 'block', fontSize: 13, fontWeight: 500, color: '#5a4d3a', marginBottom: 6}}>
              Type
            </label>
            <select
              value={type}
              onChange={(e) => setType(e.target.value)}
              style={{
                width: '100%',
                padding: '10px 14px',
                border: '1px solid #ede5d6',
                borderRadius: 8,
                fontSize: 15,
                background: '#fafaf6',
                fontFamily: 'inherit',
                cursor: 'pointer',
              }}
            >
              <option value="brasserie">Brasserie / Restaurant</option>
              <option value="hotel">Hôtel</option>
              <option value="evenementiel">Lieu événementiel</option>
              <option value="autre">Autre</option>
            </select>
          </div>

          {error && (
            <div style={{
              background: '#fdeded',
              color: '#a83232',
              padding: '10px 14px',
              borderRadius: 8,
              fontSize: 13,
              marginBottom: 16,
            }}>
              ⚠️ {error}
            </div>
          )}

          <div style={{display: 'flex', gap: 12, justifyContent: 'flex-end'}}>
            <button
              type="button"
              onClick={() => router.push('/mails')}
              style={{
                padding: '10px 20px',
                background: 'transparent',
                color: '#8a7a64',
                border: '1px solid #ede5d6',
                borderRadius: 8,
                cursor: 'pointer',
                fontSize: 14,
                fontFamily: 'inherit',
              }}
            >
              Annuler
            </button>
            <button
              type="submit"
              disabled={submitting || !nom.trim()}
              style={{
                padding: '10px 24px',
                background: submitting || !nom.trim() ? '#c9b698' : '#8b6f47',
                color: '#fff',
                border: 'none',
                borderRadius: 8,
                cursor: submitting || !nom.trim() ? 'not-allowed' : 'pointer',
                fontSize: 14,
                fontWeight: 600,
                fontFamily: 'inherit',
              }}
            >
              {submitting ? 'Création…' : 'Créer'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
