/**
 * ═══════════════════════════════════════════════════════════════
 *  /api/gmail/connect — Initie le flow OAuth Gmail
 * ═══════════════════════════════════════════════════════════════
 *
 * Cette route construit l'URL OAuth Google avec les scopes Gmail
 * et redirige l'utilisateur vers Google pour autorisation.
 *
 * Au retour (callback), /api/gmail/callback reçoit le code
 * et l'échange contre un access_token + refresh_token qui sont
 * persistés dans gmail_connections.
 *
 * Le `state` encode l'organisation active (depuis le cookie de session)
 * et l'URL de retour pour que la redirection finale ramène l'utilisateur
 * exactement où il était.
 *
 * USAGE :
 *   - Manuel : <a href="/api/gmail/connect">Connecter Gmail</a>
 *   - Auto : window.location.href = '/api/gmail/connect?return=/mails'
 *     (déclenché par api-fetch.ts quand un appel renvoie GMAIL_AUTH_EXPIRED)
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { supabaseAdmin } from '@/lib/supabase';
import { randomBytes } from 'crypto';

// Scopes Gmail nécessaires pour l'app : lecture + envoi + modification (labels, archive)
const GMAIL_SCOPES = [
  'openid',
  'email',
  'profile',
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/gmail.modify',
].join(' ');

export async function GET(req: NextRequest) {
  // Vérifier que l'utilisateur est authentifié (NextAuth)
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.redirect(new URL('/', req.url));
  }

  // Récupérer l'org active de l'utilisateur
  const { data: user } = await supabaseAdmin
    .from('users')
    .select('id, active_organisation_id')
    .eq('email', session.user.email)
    .single();

  if (!user?.active_organisation_id) {
    return NextResponse.redirect(new URL('/onboarding/new-org', req.url));
  }

  // Récupérer l'URL de retour (où on était quand le token a expiré)
  const returnTo = new URL(req.url).searchParams.get('return') || '/mails';

  // Générer un state aléatoire et le stocker côté serveur (en DB)
  // pour vérifier l'authenticité du callback (anti-CSRF)
  const stateToken = randomBytes(32).toString('hex');
  const stateData = {
    userId: user.id,
    orgId: user.active_organisation_id,
    returnTo,
    createdAt: Date.now(),
  };

  // Stocker le state dans une table temporaire (TTL 10 min)
  await supabaseAdmin.from('oauth_states').insert({
    token: stateToken,
    payload: stateData,
    expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
  });

  // Construire l'URL OAuth Google
  const redirectUri = `${getOrigin(req)}/api/gmail/callback`;
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID!,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: GMAIL_SCOPES,
    access_type: 'offline',         // Indispensable pour obtenir un refresh_token
    prompt: 'consent',              // FORCE Google à redonner un refresh_token
                                    // (sinon Google n'en redonne pas si l'app a déjà été autorisée)
    state: stateToken,
    include_granted_scopes: 'true', // Cumule avec les scopes déjà accordés
  });

  const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
  return NextResponse.redirect(authUrl);
}

// Helper pour obtenir l'origine (scheme + host) en prod et en dev
function getOrigin(req: NextRequest): string {
  // Priorité : variable d'env explicite (utile pour les tunnels ngrok, etc.)
  if (process.env.NEXT_PUBLIC_APP_URL) return process.env.NEXT_PUBLIC_APP_URL;

  const host = req.headers.get('host') || 'archange-olive.vercel.app';
  const proto = req.headers.get('x-forwarded-proto') || 'https';
  return `${proto}://${host}`;
}
