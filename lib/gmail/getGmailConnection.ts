/**
 * ═══════════════════════════════════════════════════════════════
 *  getGmailConnection — Récupère le token Gmail par organisation
 * ═══════════════════════════════════════════════════════════════
 *
 * Dans l'ancienne archi, les tokens OAuth Gmail étaient dans la table
 * `accounts` attachés à un user_id (via NextAuth).
 *
 * Dans la nouvelle archi multi-tenant, les tokens sont attachés à une
 * ORGANISATION via la table `gmail_connections` :
 *   - 1 organisation peut avoir N boîtes Gmail liées
 *   - Par défaut on utilise la première is_active=true
 *
 * Ce helper retourne un token d'accès valide, en rafraîchissant via le
 * refresh_token si l'access_token est expiré.
 *
 * USAGE :
 *   const conn = await getGmailConnection(orgId);
 *   if (!conn) return NextResponse.json({ error: 'No Gmail connection' }, 404);
 *   const gmailAccessToken = conn.accessToken;
 *   // utiliser dans les appels Gmail API
 *
 * NOUVELLE ERREUR TYPÉE (Phase D bonus) :
 *   getGmailConnection retourne null dans 2 cas :
 *     1. Aucune ligne dans gmail_connections → besoin d'une 1ère connexion
 *     2. refresh_token révoqué/invalide → besoin d'une RECONNEXION
 *   Pour distinguer les deux, le helper expose maintenant getGmailConnectionStrict
 *   qui throw GmailAuthExpiredError dans le cas 2.
 */

import { supabaseAdmin } from '@/lib/supabase';

export interface GmailConnection {
  id: string;
  email: string;
  label: string | null;
  accessToken: string;
  refreshToken: string;
  expiresAt: Date | null;
  historyId: bigint | null;
  organisationId: string;
}

// ─── Erreur typée pour les routes qui veulent déclencher la reconnexion auto ──
export class GmailAuthExpiredError extends Error {
  constructor(public readonly organisationId: string, public readonly reason: string) {
    super(`Gmail authentication expired for org ${organisationId}: ${reason}`);
    this.name = 'GmailAuthExpiredError';
  }
}

/**
 * Récupère la connexion Gmail active d'une organisation.
 * Si un `email` est fourni, récupère cette connexion précise (utile si l'org
 * a plusieurs boîtes Gmail). Sinon la première active.
 *
 * Retourne null si :
 *   - Aucune connexion configurée pour cette org
 *   - Le refresh_token est révoqué/invalide (le caller devrait préférer
 *     getGmailConnectionStrict pour distinguer les deux cas)
 */
export async function getGmailConnection(
  organisationId: string,
  email?: string
): Promise<GmailConnection | null> {
  let query = supabaseAdmin
    .from('gmail_connections')
    .select('id, email, label, oauth_access_token, oauth_refresh_token, oauth_expires_at, history_id, organisation_id')
    .eq('organisation_id', organisationId)
    .eq('is_active', true);

  if (email) query = query.eq('email', email);

  const { data, error } = await query.limit(1).single();
  if (error || !data) return null;

  const conn: GmailConnection = {
    id: data.id,
    email: data.email,
    label: data.label,
    accessToken: data.oauth_access_token,
    refreshToken: data.oauth_refresh_token,
    expiresAt: data.oauth_expires_at ? new Date(data.oauth_expires_at) : null,
    historyId: data.history_id,
    organisationId: data.organisation_id,
  };

  // Rafraîchir si expiré (ou proche de l'être — 5 min de marge)
  if (isTokenExpired(conn.expiresAt)) {
    const refreshed = await refreshGmailToken(conn);
    if (refreshed) return refreshed;
    return null;
  }

  return conn;
}

/**
 * Variante "stricte" qui throw GmailAuthExpiredError si la reconnexion
 * est nécessaire. À utiliser dans les routes API qui doivent renvoyer
 * une réponse 401 + { error: 'GMAIL_AUTH_EXPIRED' } au frontend.
 *
 * USAGE :
 *   try {
 *     const conn = await getGmailConnectionStrict(orgId);
 *     // utiliser conn.accessToken
 *   } catch (e) {
 *     if (e instanceof GmailAuthExpiredError) {
 *       return NextResponse.json({ error: 'GMAIL_AUTH_EXPIRED' }, { status: 401 });
 *     }
 *     throw e;
 *   }
 */
export async function getGmailConnectionStrict(
  organisationId: string,
  email?: string
): Promise<GmailConnection> {
  let query = supabaseAdmin
    .from('gmail_connections')
    .select('id, email, label, oauth_access_token, oauth_refresh_token, oauth_expires_at, history_id, organisation_id')
    .eq('organisation_id', organisationId)
    .eq('is_active', true);

  if (email) query = query.eq('email', email);

  const { data, error } = await query.limit(1).single();
  if (error || !data) {
    throw new GmailAuthExpiredError(organisationId, 'no_connection');
  }

  const conn: GmailConnection = {
    id: data.id,
    email: data.email,
    label: data.label,
    accessToken: data.oauth_access_token,
    refreshToken: data.oauth_refresh_token,
    expiresAt: data.oauth_expires_at ? new Date(data.oauth_expires_at) : null,
    historyId: data.history_id,
    organisationId: data.organisation_id,
  };

  if (isTokenExpired(conn.expiresAt)) {
    const refreshed = await refreshGmailToken(conn);
    if (!refreshed) {
      throw new GmailAuthExpiredError(organisationId, 'refresh_failed');
    }
    return refreshed;
  }

  return conn;
}

function isTokenExpired(expiresAt: Date | null): boolean {
  if (!expiresAt) return false; // pas de date d'expiration, on suppose valide
  return expiresAt.getTime() - 5 * 60 * 1000 < Date.now();
}

/**
 * Rafraîchit le token OAuth Google via le refresh_token stocké,
 * puis met à jour la DB.
 */
async function refreshGmailToken(conn: GmailConnection): Promise<GmailConnection | null> {
  if (!conn.refreshToken) return null;

  try {
    const r = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: process.env.GOOGLE_CLIENT_ID!,
        client_secret: process.env.GOOGLE_CLIENT_SECRET!,
        refresh_token: conn.refreshToken,
        grant_type: 'refresh_token',
      }),
    });

    if (!r.ok) {
      const errText = await r.text();
      console.error('[getGmailConnection] refresh failed:', errText);

      // Si le refresh_token est définitivement invalide, on désactive la connexion
      // pour ne pas spammer Google API à chaque requête.
      if (errText.includes('invalid_grant') || errText.includes('revoked')) {
        await supabaseAdmin
          .from('gmail_connections')
          .update({ is_active: false })
          .eq('id', conn.id);
      }

      return null;
    }

    const { access_token, expires_in } = await r.json();
    const newExpiresAt = new Date(Date.now() + expires_in * 1000);

    // Persister le nouveau token
    await supabaseAdmin
      .from('gmail_connections')
      .update({
        oauth_access_token: access_token,
        oauth_expires_at: newExpiresAt.toISOString(),
      })
      .eq('id', conn.id);

    return { ...conn, accessToken: access_token, expiresAt: newExpiresAt };
  } catch (err) {
    console.error('[getGmailConnection] refresh error:', err);
    return null;
  }
}

/**
 * Met à jour le history_id de la connexion Gmail (pour la sync différentielle).
 */
export async function updateGmailHistoryId(
  connectionId: string,
  historyId: bigint | number | string
): Promise<void> {
  await supabaseAdmin
    .from('gmail_connections')
    .update({ history_id: typeof historyId === 'bigint' ? historyId.toString() : historyId })
    .eq('id', connectionId);
}

/**
 * Récupère la connexion Gmail par l'email (pour les webhooks entrants
 * où on n'a que l'adresse email comme identifiant).
 */
export async function getGmailConnectionByEmail(
  email: string
): Promise<GmailConnection | null> {
  const { data } = await supabaseAdmin
    .from('gmail_connections')
    .select('id, email, label, oauth_access_token, oauth_refresh_token, oauth_expires_at, history_id, organisation_id')
    .eq('email', email)
    .eq('is_active', true)
    .limit(1)
    .single();
  if (!data) return null;

  return {
    id: data.id,
    email: data.email,
    label: data.label,
    accessToken: data.oauth_access_token,
    refreshToken: data.oauth_refresh_token,
    expiresAt: data.oauth_expires_at ? new Date(data.oauth_expires_at) : null,
    historyId: data.history_id,
    organisationId: data.organisation_id,
  };
}
