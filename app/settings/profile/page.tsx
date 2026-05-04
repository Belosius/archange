'use client'
/**
 * ═══════════════════════════════════════════════════════════════
 *  /settings/profile — Mon profil utilisateur
 * ═══════════════════════════════════════════════════════════════
 *
 * Affiche et permet de modifier les infos personnelles de l'utilisateur :
 *   - Prénom / nom (modifiables)
 *   - Email Google de connexion (lecture seule)
 *   - Email Gmail métier de l'org active (lecture seule, encadré explicatif)
 *   - Photo de profil Google
 *   - Rôle dans l'org active
 *   - Liste des organisations + bouton de bascule
 *
 * Design RÊVA : background #FAFAF7, accent #B8924F, fonts Fraunces/Geist.
 */

import { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useSession, signOut } from 'next-auth/react';
import { apiFetch } from '@/lib/api-fetch';
import {
  getRoleLabel,
  getRoleDescription,
  getRoleColors,
} from '@/lib/role-labels';

interface Membership {
  role: string;
  joined_at: string;
  organisation: {
    id: string;
    nom: string;
    slug: string;
    type: string;
  };
}

interface ProfileData {
  profile: {
    id: string;
    email: string;
    name: string | null;
    prenom: string | null;
    nom: string | null;
    image: string | null;
    active_organisation_id: string | null;
    created_at: string;
  };
  activeOrgRole: string | null;
  gmailConnection: { email: string; label: string | null } | null;
  memberships: Membership[];
}

export default function ProfilePage() {
  const router = useRouter();
  const { status } = useSession();
  const [data, setData] = useState<ProfileData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Édition prenom/nom
  const [editing, setEditing] = useState(false);
  const [editPrenom, setEditPrenom] = useState('');
  const [editNom, setEditNom] = useState('');
  const [saving, setSaving] = useState(false);

  // Bascule d'org
  const [switching, setSwitching] = useState<string | null>(null);

  // Notif simple inline
  const [notif, setNotif] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);
  const notifTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function showNotif(msg: string, type: 'success' | 'error') {
    setNotif({ msg, type });
    if (notifTimeoutRef.current) clearTimeout(notifTimeoutRef.current);
    notifTimeoutRef.current = setTimeout(() => setNotif(null), 4000);
  }

  // Redirect si pas connecté
  useEffect(() => {
    if (status === 'unauthenticated') router.replace('/');
  }, [status, router]);

  // Fetch initial
  useEffect(() => {
    if (status !== 'authenticated') return;
    apiFetch('/api/profile')
      .then(r => {
        if (!r.ok) throw new Error('Failed to load profile');
        return r.json();
      })
      .then((d: ProfileData) => {
        setData(d);
        setEditPrenom(d.profile.prenom || '');
        setEditNom(d.profile.nom || '');
        setLoading(false);
      })
      .catch(e => {
        console.error(e);
        setError('Impossible de charger votre profil');
        setLoading(false);
      });
  }, [status]);

  async function handleSave() {
    if (!editPrenom.trim() || !editNom.trim()) {
      showNotif('Le prénom et le nom sont obligatoires', 'error');
      return;
    }
    setSaving(true);
    try {
      const r = await apiFetch('/api/profile', {
        method: 'PATCH',
        body: JSON.stringify({ prenom: editPrenom, nom: editNom }),
      });
      const j = await r.json();
      if (!r.ok) {
        showNotif(j.error || 'Échec de la mise à jour', 'error');
        return;
      }
      // Refresh local
      setData(d => d ? {
        ...d,
        profile: {
          ...d.profile,
          prenom: j.profile.prenom,
          nom: j.profile.nom,
          name: j.profile.name,
        }
      } : d);
      setEditing(false);
      showNotif('Profil mis à jour', 'success');
    } catch {
      showNotif('Erreur réseau, réessayez', 'error');
    } finally {
      setSaving(false);
    }
  }

  function handleCancelEdit() {
    setEditPrenom(data?.profile.prenom || '');
    setEditNom(data?.profile.nom || '');
    setEditing(false);
  }

  async function handleSwitchOrg(orgId: string) {
    if (orgId === data?.profile.active_organisation_id) return;
    setSwitching(orgId);
    try {
      const r = await apiFetch('/api/orgs/switch', {
        method: 'POST',
        body: JSON.stringify({ orgId }),
      });
      if (!r.ok) throw new Error('Switch failed');
      window.location.reload();
    } catch {
      showNotif("Impossible de changer d'organisation", 'error');
      setSwitching(null);
    }
  }

  // ─── États de chargement ────────────────────────────────────────
  if (status === 'loading' || loading) {
    return (
      <div style={pageStyle}>
        <div style={{ ...containerStyle, textAlign: 'center', paddingTop: 80 }}>
          <div style={{ color: '#6B6E7E', fontSize: 14 }}>Chargement de votre profil…</div>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div style={pageStyle}>
        <div style={{ ...containerStyle, textAlign: 'center', paddingTop: 80 }}>
          <div style={{ color: '#A14545', fontSize: 14, marginBottom: 12 }}>
            {error || 'Erreur de chargement'}
          </div>
          <button onClick={() => window.location.reload()} style={btnPrimary}>
            Réessayer
          </button>
        </div>
      </div>
    );
  }

  const { profile, activeOrgRole, gmailConnection, memberships } = data;
  const fullName = [profile.prenom, profile.nom].filter(Boolean).join(' ') || profile.email;

  // Les deux emails sont-ils différents ?
  const googleEmail = profile.email;
  const gmailMetierEmail = gmailConnection?.email || null;
  const sameEmail = gmailMetierEmail && googleEmail.toLowerCase() === gmailMetierEmail.toLowerCase();

  const activeOrg = memberships.find(m => m.organisation.id === profile.active_organisation_id)?.organisation;
  const hasMultipleOrgs = memberships.length > 1;

  return (
    <div style={pageStyle}>
      <div style={containerStyle}>
        {/* Notification */}
        {notif && (
          <div
            style={{
              position: 'fixed',
              top: 24,
              right: 24,
              padding: '12px 18px',
              background: notif.type === 'success' ? '#1F6B3A' : '#A14545',
              color: '#FFFFFF',
              borderRadius: 8,
              fontSize: 13,
              fontWeight: 500,
              boxShadow: '0 8px 24px rgba(0,0,0,0.15)',
              zIndex: 1000,
            }}
            role="status"
          >
            {notif.msg}
          </div>
        )}

        {/* Header de page */}
        <div style={{ marginBottom: 32 }}>
          <button
            onClick={() => router.back()}
            style={{
              background: 'none',
              border: 'none',
              color: '#6B6E7E',
              fontSize: 13,
              cursor: 'pointer',
              padding: 0,
              marginBottom: 16,
              fontFamily: 'inherit',
            }}
          >
            ← Retour
          </button>
          <h1
            style={{
              fontFamily: "'Fraunces',Georgia,serif",
              fontSize: 32,
              fontWeight: 500,
              color: '#1A1A1E',
              margin: 0,
              lineHeight: 1.2,
            }}
          >
            Mon profil
          </h1>
          <p style={{ color: '#6B6E7E', fontSize: 14, marginTop: 8, marginBottom: 0 }}>
            Vos informations personnelles et vos accès à ARCHANGE.
          </p>
        </div>

        {/* ─── BLOC 1 : Identité ──────────────────────────────────── */}
        <section style={cardStyle}>
          <div style={{ display: 'flex', gap: 20, alignItems: 'flex-start', marginBottom: 24 }}>
            {/* Photo de profil */}
            <div
              style={{
                width: 80,
                height: 80,
                borderRadius: '50%',
                background: '#EBEAE5',
                overflow: 'hidden',
                flexShrink: 0,
                display: 'grid',
                placeItems: 'center',
                fontSize: 28,
                fontWeight: 600,
                color: '#B8924F',
                fontFamily: "'Fraunces',Georgia,serif",
              }}
            >
              {profile.image ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  src={profile.image}
                  alt={fullName}
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                />
              ) : (
                (profile.prenom?.[0] || profile.email[0] || '?').toUpperCase()
              )}
            </div>
            <div style={{ flex: 1 }}>
              <div
                style={{
                  fontSize: 11,
                  letterSpacing: '0.12em',
                  textTransform: 'uppercase',
                  color: '#6B6E7E',
                  marginBottom: 4,
                  fontWeight: 500,
                }}
              >
                Identité
              </div>
              <div
                style={{
                  fontFamily: "'Fraunces',Georgia,serif",
                  fontSize: 22,
                  fontWeight: 500,
                  color: '#1A1A1E',
                  lineHeight: 1.2,
                }}
              >
                {fullName}
              </div>
              <div style={{ fontSize: 13, color: '#6B6E7E', marginTop: 2 }}>
                Membre depuis le{' '}
                {new Date(profile.created_at).toLocaleDateString('fr-FR', {
                  day: 'numeric',
                  month: 'long',
                  year: 'numeric',
                })}
              </div>
            </div>
          </div>

          {/* Édition prenom/nom */}
          {!editing ? (
            <div>
              <div style={fieldRowStyle}>
                <div style={fieldLabelStyle}>Prénom</div>
                <div style={fieldValueStyle}>{profile.prenom || <em style={{ color: '#A0A0A8' }}>Non renseigné</em>}</div>
              </div>
              <div style={fieldRowStyle}>
                <div style={fieldLabelStyle}>Nom</div>
                <div style={fieldValueStyle}>{profile.nom || <em style={{ color: '#A0A0A8' }}>Non renseigné</em>}</div>
              </div>
              <div style={{ marginTop: 16 }}>
                <button onClick={() => setEditing(true)} style={btnSecondary}>
                  Modifier mon prénom et mon nom
                </button>
              </div>
            </div>
          ) : (
            <div>
              <div style={fieldRowStyle}>
                <label style={fieldLabelStyle} htmlFor="profile-prenom">Prénom</label>
                <input
                  id="profile-prenom"
                  type="text"
                  value={editPrenom}
                  onChange={e => setEditPrenom(e.target.value)}
                  disabled={saving}
                  style={inputStyle}
                  maxLength={100}
                  autoFocus
                />
              </div>
              <div style={fieldRowStyle}>
                <label style={fieldLabelStyle} htmlFor="profile-nom">Nom</label>
                <input
                  id="profile-nom"
                  type="text"
                  value={editNom}
                  onChange={e => setEditNom(e.target.value)}
                  disabled={saving}
                  style={inputStyle}
                  maxLength={100}
                />
              </div>
              <div style={{ display: 'flex', gap: 8, marginTop: 16, justifyContent: 'flex-end' }}>
                <button onClick={handleCancelEdit} disabled={saving} style={btnGhost}>
                  Annuler
                </button>
                <button onClick={handleSave} disabled={saving} style={btnPrimary}>
                  {saving ? 'Enregistrement…' : 'Enregistrer'}
                </button>
              </div>
            </div>
          )}
        </section>

        {/* ─── BLOC 2 : Vos deux adresses email ───────────────────── */}
        <section style={{ ...cardStyle, background: '#FFFCF2', borderColor: '#E8D89C' }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              fontSize: 11,
              letterSpacing: '0.12em',
              textTransform: 'uppercase',
              color: '#8B6914',
              marginBottom: 14,
              fontWeight: 600,
            }}
          >
            <span style={{ fontSize: 16 }}>📧</span>
            <span>Vos adresses email</span>
          </div>

          {sameEmail ? (
            // Cas où les deux emails sont identiques
            <div>
              <p style={{ fontSize: 13, color: '#4A4A52', lineHeight: 1.6, marginTop: 0, marginBottom: 14 }}>
                Votre compte de connexion ARCHANGE et la boîte mail de votre organisation
                utilisent la <strong>même adresse</strong>.
              </p>
              <div style={emailBlockStyle}>
                <div style={emailLabelStyle}>Connexion ARCHANGE + Boîte mail</div>
                <div style={emailValueStyle}>{googleEmail}</div>
              </div>
            </div>
          ) : (
            // Cas où les deux sont différents (cas d'Olivier actuellement)
            <div>
              <p style={{ fontSize: 13, color: '#4A4A52', lineHeight: 1.6, marginTop: 0, marginBottom: 14 }}>
                Vous utilisez <strong>deux adresses différentes</strong>. C'est tout à fait
                normal : votre compte de connexion peut être personnel, alors que la boîte
                mail traitée par ARCHANGE est celle de l'établissement.
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div style={emailBlockStyle}>
                  <div style={emailLabelStyle}>Connexion Google</div>
                  <div style={emailValueStyle}>{googleEmail}</div>
                  <div style={emailHintStyle}>
                    Utilisée pour vous authentifier dans ARCHANGE.
                  </div>
                </div>
                {gmailMetierEmail ? (
                  <div style={emailBlockStyle}>
                    <div style={emailLabelStyle}>Boîte mail ARCHANGE</div>
                    <div style={emailValueStyle}>{gmailMetierEmail}</div>
                    <div style={emailHintStyle}>
                      Les emails de la brasserie arrivent ici. ARCHANGE les lit et envoie
                      les réponses depuis cette adresse.
                    </div>
                  </div>
                ) : (
                  <div style={{ ...emailBlockStyle, background: '#FFF6E5', borderColor: '#E8C77C' }}>
                    <div style={emailLabelStyle}>Boîte mail ARCHANGE</div>
                    <div style={{ ...emailValueStyle, color: '#8B6914', fontStyle: 'normal' }}>
                      Aucune boîte connectée pour cette organisation
                    </div>
                    <div style={emailHintStyle}>
                      Connectez une boîte Gmail pour qu'ARCHANGE puisse traiter vos emails.
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </section>

        {/* ─── BLOC 3 : Niveau d'autorisation ─────────────────────── */}
        {activeOrg && activeOrgRole && (
          <section style={cardStyle}>
            <div style={sectionTitleStyle}>Niveau d'autorisation</div>
            <p style={{ fontSize: 13, color: '#6B6E7E', marginTop: 0, marginBottom: 14 }}>
              Votre rôle dans <strong>{activeOrg.nom}</strong> (organisation active).
            </p>
            <div
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: 12,
                padding: 16,
                background: '#FAFAF7',
                border: '1px solid #EBEAE5',
                borderRadius: 8,
              }}
            >
              <RoleBadge role={activeOrgRole} />
              <div style={{ flex: 1 }}>
                <div
                  style={{
                    fontSize: 15,
                    fontWeight: 600,
                    color: '#1A1A1E',
                    marginBottom: 4,
                  }}
                >
                  {getRoleLabel(activeOrgRole)}
                </div>
                <div style={{ fontSize: 13, color: '#4A4A52', lineHeight: 1.5 }}>
                  {getRoleDescription(activeOrgRole)}
                </div>
              </div>
            </div>
            <div
              style={{
                marginTop: 12,
                fontSize: 12,
                color: '#6B6E7E',
                lineHeight: 1.5,
              }}
            >
              💡 Seul un administrateur peut modifier votre rôle. Pour toute demande,
              contactez directement la personne qui vous a invité·e.
            </div>
          </section>
        )}

        {/* ─── BLOC 4 : Organisations ─────────────────────────────── */}
        <section style={cardStyle}>
          <div style={sectionTitleStyle}>
            {memberships.length > 1 ? 'Vos organisations' : 'Votre organisation'}
          </div>
          <p style={{ fontSize: 13, color: '#6B6E7E', marginTop: 0, marginBottom: 16 }}>
            {memberships.length > 1
              ? `Vous êtes membre de ${memberships.length} organisations.`
              : 'Vous êtes membre d\'une seule organisation.'}
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {memberships.map(m => {
              const isActive = m.organisation.id === profile.active_organisation_id;
              const isSwitching = switching === m.organisation.id;
              return (
                <div
                  key={m.organisation.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 14,
                    padding: 14,
                    background: isActive ? '#F5F4F0' : '#FFFFFF',
                    border: '1px solid',
                    borderColor: isActive ? '#B8924F' : '#EBEAE5',
                    borderRadius: 8,
                  }}
                >
                  <div
                    style={{
                      width: 36,
                      height: 36,
                      borderRadius: 8,
                      background: '#B8924F',
                      color: '#FFFFFF',
                      display: 'grid',
                      placeItems: 'center',
                      fontSize: 14,
                      fontWeight: 700,
                      flexShrink: 0,
                      fontFamily: "'Fraunces',Georgia,serif",
                    }}
                  >
                    {m.organisation.nom[0]?.toUpperCase()}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        fontSize: 14,
                        fontWeight: 600,
                        color: '#1A1A1E',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        flexWrap: 'wrap',
                      }}
                    >
                      <span>{m.organisation.nom}</span>
                      {isActive && (
                        <span
                          style={{
                            fontSize: 10,
                            padding: '2px 8px',
                            background: '#B8924F',
                            color: '#FFFFFF',
                            borderRadius: 10,
                            letterSpacing: '0.05em',
                            textTransform: 'uppercase',
                            fontWeight: 600,
                          }}
                        >
                          Active
                        </span>
                      )}
                    </div>
                    <div
                      style={{
                        fontSize: 12,
                        color: '#6B6E7E',
                        marginTop: 4,
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        flexWrap: 'wrap',
                      }}
                    >
                      <RoleBadge role={m.role} small />
                      <span>•</span>
                      <span>
                        Membre depuis le{' '}
                        {new Date(m.joined_at).toLocaleDateString('fr-FR', {
                          day: 'numeric',
                          month: 'short',
                          year: 'numeric',
                        })}
                      </span>
                    </div>
                  </div>
                  {!isActive && hasMultipleOrgs && (
                    <button
                      onClick={() => handleSwitchOrg(m.organisation.id)}
                      disabled={isSwitching}
                      style={{
                        ...btnSecondary,
                        opacity: isSwitching ? 0.6 : 1,
                        cursor: isSwitching ? 'wait' : 'pointer',
                        flexShrink: 0,
                      }}
                    >
                      {isSwitching ? 'Bascule…' : 'Basculer'}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </section>

        {/* ─── Déconnexion ─────────────────────────────────────────── */}
        <div style={{ marginTop: 16, marginBottom: 32, textAlign: 'center' }}>
          <button
            onClick={() => signOut({ callbackUrl: '/' })}
            style={{
              background: 'none',
              border: 'none',
              color: '#A14545',
              fontSize: 13,
              cursor: 'pointer',
              padding: '8px 16px',
              fontFamily: 'inherit',
            }}
          >
            Se déconnecter d'ARCHANGE
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Composant : badge de rôle ──────────────────────────────────────
function RoleBadge({ role, small = false }: { role: string; small?: boolean }) {
  const colors = getRoleColors(role);
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        padding: small ? '2px 8px' : '6px 12px',
        background: colors.bg,
        color: colors.fg,
        border: `1px solid ${colors.border}`,
        borderRadius: small ? 6 : 8,
        fontSize: small ? 11 : 13,
        fontWeight: 600,
        whiteSpace: 'nowrap',
      }}
    >
      {getRoleLabel(role)}
    </span>
  );
}

// ─── Styles ───────────────────────────────────────────────────────
const pageStyle: React.CSSProperties = {
  minHeight: '100vh',
  background: '#FAFAF7',
  fontFamily: "'Geist','Helvetica Neue',Arial,sans-serif",
  color: '#1A1A1E',
};

const containerStyle: React.CSSProperties = {
  maxWidth: 720,
  margin: '0 auto',
  padding: '40px 24px',
};

const cardStyle: React.CSSProperties = {
  background: '#FFFFFF',
  border: '1px solid #EBEAE5',
  borderRadius: 10,
  padding: 24,
  marginBottom: 16,
};

const sectionTitleStyle: React.CSSProperties = {
  fontSize: 11,
  letterSpacing: '0.12em',
  textTransform: 'uppercase',
  color: '#6B6E7E',
  marginBottom: 14,
  fontWeight: 600,
};

const fieldRowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 16,
  padding: '10px 0',
  borderBottom: '1px solid #F0EFEA',
};

const fieldLabelStyle: React.CSSProperties = {
  fontSize: 13,
  fontWeight: 500,
  color: '#6B6E7E',
  width: 120,
  flexShrink: 0,
};

const fieldValueStyle: React.CSSProperties = {
  fontSize: 14,
  color: '#1A1A1E',
  flex: 1,
};

const inputStyle: React.CSSProperties = {
  flex: 1,
  padding: '8px 12px',
  border: '1px solid #DBDAD3',
  borderRadius: 6,
  fontSize: 14,
  color: '#1A1A1E',
  background: '#FFFFFF',
  fontFamily: 'inherit',
  outline: 'none',
};

const btnPrimary: React.CSSProperties = {
  padding: '9px 18px',
  background: '#B8924F',
  color: '#FFFFFF',
  border: '1px solid #B8924F',
  borderRadius: 6,
  fontSize: 13,
  fontWeight: 500,
  cursor: 'pointer',
  fontFamily: 'inherit',
};

const btnSecondary: React.CSSProperties = {
  padding: '8px 14px',
  background: '#FFFFFF',
  color: '#1A1A1E',
  border: '1px solid #DBDAD3',
  borderRadius: 6,
  fontSize: 13,
  fontWeight: 500,
  cursor: 'pointer',
  fontFamily: 'inherit',
};

const btnGhost: React.CSSProperties = {
  padding: '8px 14px',
  background: 'transparent',
  color: '#6B6E7E',
  border: 'none',
  borderRadius: 6,
  fontSize: 13,
  cursor: 'pointer',
  fontFamily: 'inherit',
};

const emailBlockStyle: React.CSSProperties = {
  padding: 14,
  background: '#FFFFFF',
  border: '1px solid #EBEAE5',
  borderRadius: 8,
};

const emailLabelStyle: React.CSSProperties = {
  fontSize: 11,
  letterSpacing: '0.1em',
  textTransform: 'uppercase',
  color: '#6B6E7E',
  marginBottom: 4,
  fontWeight: 600,
};

const emailValueStyle: React.CSSProperties = {
  fontSize: 15,
  fontWeight: 500,
  color: '#1A1A1E',
  fontVariantNumeric: 'tabular-nums',
  wordBreak: 'break-all',
};

const emailHintStyle: React.CSSProperties = {
  fontSize: 12,
  color: '#6B6E7E',
  marginTop: 6,
  lineHeight: 1.5,
};
