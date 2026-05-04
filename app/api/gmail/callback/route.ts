/**
 * ═══════════════════════════════════════════════════════════════
 *  /api/gmail/callback — Réception du code OAuth Gmail
 * ═══════════════════════════════════════════════════════════════
 *
 * Cette route est appelée par Google après que l'utilisateur a
 * autorisé l'accès à Gmail. Elle :
 *   1. Vérifie l'authenticité du `state` (anti-CSRF)
 *   2. Échange le `code` contre un access_token + refresh_token
 *   3. Récupère l'email du compte Google connecté (introspection token)
 *   4. UPSERT dans `gmail_connections` (organisation_id de l'org active)
 *   5. Redirige vers la page d'origine
 *
 * En cas d'erreur, redirige vers /mails avec un query param ?gmail_error=...
 * pour permettre au frontend d'afficher un toast d'erreur.
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { logActivity } from '@/lib/activity';

interface OAuthState {
  userId: string;
  orgId: string;
  returnTo: string;
  createdAt: number;
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const code = url.searchParams.get('code');
  const stateToken = url.searchParams.get('state');
  const error = url.searchParams.get('error');

  // Cas 1 : l'utilisateur a refusé l'autorisation
  if (error) {
    console.error('[gmail/callback] User denied:', error);
    return NextResponse.redirect(
      new URL(`/mails?gmail_error=${encodeURIComponent(error)}`, req.url)
    );
  }

  if (!code || !stateToken) {
    return NextResponse.redirect(
      new URL('/mails?gmail_error=missing_params', req.url)
    );
  }

  // Cas 2 : récupérer et valider le state
  const { data: stateRow } = await supabaseAdmin
    .from('oauth_states')
    .select('payload, expires_at')
    .eq('token', stateToken)
    .maybeSingle();

  if (!stateRow) {
    return NextResponse.redirect(
      new URL('/mails?gmail_error=invalid_state', req.url)
    );
  }

  // Cleanup : on supprime le state une fois utilisé (anti-replay)
  await supabaseAdmin.from('oauth_states').delete().eq('token', stateToken);

  if (new Date(stateRow.expires_at).getTime() < Date.now()) {
    return NextResponse.redirect(
      new URL('/mails?gmail_error=state_expired', req.url)
    );
  }

  const state = stateRow.payload as OAuthState;

  // Cas 3 : échanger le code contre des tokens
  const redirectUri = `${getOrigin(req)}/api/gmail/callback`;
  const tokenResp = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    }),
  });

  if (!tokenResp.ok) {
    const errText = await tokenResp.text();
    console.error('[gmail/callback] Token exchange failed:', errText);
    return NextResponse.redirect(
      new URL('/mails?gmail_error=token_exchange_failed', req.url)
    );
  }

  const tokens = await tokenResp.json();
  const { access_token, refresh_token, expires_in, id_token } = tokens;

  if (!access_token) {
    return NextResponse.redirect(
      new URL('/mails?gmail_error=no_access_token', req.url)
    );
  }

  // ⚠️ refresh_token N'EST renvoyé QUE si access_type=offline + prompt=consent
  // Si Google ne l'a pas renvoyé (cas rare), on garde l'ancien (s'il existe)
  let refreshTokenToUse = refresh_token;
  if (!refreshTokenToUse) {
    const { data: existing } = await supabaseAdmin
      .from('gmail_connections')
      .select('oauth_refresh_token')
      .eq('organisation_id', state.orgId)
      .eq('is_active', true)
      .maybeSingle();
    refreshTokenToUse = existing?.oauth_refresh_token;
    if (!refreshTokenToUse) {
      console.error('[gmail/callback] No refresh_token returned and no existing one');
      return NextResponse.redirect(
        new URL('/mails?gmail_error=no_refresh_token', req.url)
      );
    }
  }

  // Cas 4 : récupérer l'email du compte Google
  // On utilise l'id_token (JWT) ou un appel à userinfo
  let connectedEmail = '';
  if (id_token) {
    try {
      const payload = JSON.parse(
        Buffer.from(id_token.split('.')[1], 'base64url').toString('utf-8')
      );
      connectedEmail = payload.email || '';
    } catch {
      // ignore, fallback userinfo
    }
  }
  if (!connectedEmail) {
    const userinfoResp = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
      headers: { Authorization: `Bearer ${access_token}` },
    });
    if (userinfoResp.ok) {
      const userinfo = await userinfoResp.json();
      connectedEmail = userinfo.email || '';
    }
  }

  if (!connectedEmail) {
    return NextResponse.redirect(
      new URL('/mails?gmail_error=no_email', req.url)
    );
  }

  // Cas 5 : UPSERT dans gmail_connections
  const expiresAt = new Date(Date.now() + (expires_in || 3600) * 1000).toISOString();
  const now = new Date().toISOString();

  const { data: existing } = await supabaseAdmin
    .from('gmail_connections')
    .select('id')
    .eq('organisation_id', state.orgId)
    .eq('email', connectedEmail)
    .maybeSingle();

  if (existing) {
    // Update : on rafraîchit les tokens
    await supabaseAdmin
      .from('gmail_connections')
      .update({
        oauth_access_token: access_token,
        oauth_refresh_token: refreshTokenToUse,
        oauth_expires_at: expiresAt,
        is_active: true,
        updated_at: now,
      })
      .eq('id', existing.id);
  } else {
    // Insert : nouvelle connexion Gmail pour cette org
    await supabaseAdmin.from('gmail_connections').insert({
      organisation_id: state.orgId,
      email: connectedEmail,
      label: connectedEmail.split('@')[0],
      oauth_access_token: access_token,
      oauth_refresh_token: refreshTokenToUse,
      oauth_expires_at: expiresAt,
      is_active: true,
    });
  }

  // Audit log
  await logActivity({
    orgId: state.orgId,
    userId: state.userId,
    action: 'gmail.connected',
    resourceType: 'gmail_connection',
    resourceId: connectedEmail,
    metadata: {
      email: connectedEmail,
      reconnect: !!existing,
    },
  });

  // Cas 6 : redirection vers la page d'origine
  return NextResponse.redirect(new URL(state.returnTo, req.url));
}

function getOrigin(req: NextRequest): string {
  if (process.env.NEXT_PUBLIC_APP_URL) return process.env.NEXT_PUBLIC_APP_URL;
  const host = req.headers.get('host') || 'archange-olive.vercel.app';
  const proto = req.headers.get('x-forwarded-proto') || 'https';
  return `${proto}://${host}`;
}
