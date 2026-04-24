/**
 * ═══════════════════════════════════════════════════════════════
 *  NextAuth — Authentification Google OAuth (multi-tenant)
 * ═══════════════════════════════════════════════════════════════
 *
 * CHANGEMENTS vs version mono-tenant :
 *   1. On n'upsert PLUS dans `accounts` au sign-in :
 *      - `accounts` est conservé par compatibilité mais n'est plus la
 *        source de vérité pour les tokens Gmail.
 *      - Les tokens Gmail métier (ex: manager.reva@gmail.com) sont
 *        désormais dans `gmail_connections`, liés à une organisation.
 *
 *   2. On n'appelle PLUS watchGmailInbox/syncRecentEmails automatiquement :
 *      - Le login Google sert uniquement à authentifier l'humain.
 *      - La connexion d'une boîte Gmail métier est un flow séparé
 *        (onboarding "Connecter Gmail") qui utilise un OAuth dédié.
 *
 *   3. On enrichit la session avec l'active_organisation_id pour que
 *      le front puisse faire ses requêtes avec le bon contexte.
 *
 * FLOW :
 *   1. User clique "Se connecter avec Google" sur /
 *   2. Google redirige avec un code OAuth
 *   3. Callback signIn : upsert dans `users`
 *   4. Callback session : enrichit la session avec orgId
 *   5. Front : si pas d'org active → redirige vers /onboarding/new-org
 *      sinon → redirige vers /mails
 */

import NextAuth, { type NextAuthOptions } from 'next-auth';
import GoogleProvider from 'next-auth/providers/google';
import { supabaseAdmin } from '@/lib/supabase';

export const authOptions: NextAuthOptions = {
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      authorization: {
        params: {
          // Pour le login ARCHANGE on demande juste l'identité (email + profil)
          // Les scopes Gmail sont demandés séparément dans le flow "Connecter Gmail"
          scope: 'openid email profile',
          access_type: 'offline',
          prompt: 'consent',
        },
      },
    }),
  ],
  session: { strategy: 'jwt' },
  callbacks: {
    /**
     * signIn : upsert de l'utilisateur dans Supabase à chaque login
     */
    async signIn({ user, account }) {
      if (!user?.email || !account) return false;

      // Upsert dans `users` — l'id reste le Google sub pour garder stabilité
      const { error } = await supabaseAdmin
        .from('users')
        .upsert(
          {
            id: account.providerAccountId, // Google sub
            email: user.email,
            name: user.name,
            image: user.image,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'id' }
        );

      if (error) {
        console.error('[NextAuth signIn] Failed to upsert user:', error);
        return false;
      }

      return true;
    },

    /**
     * jwt : persiste des champs utiles dans le token JWT (chiffré)
     */
    async jwt({ token, user, account }) {
      // Au premier login, on stocke l'id Google pour le retrouver partout
      if (account && user) {
        token.sub = account.providerAccountId;
      }
      return token;
    },

    /**
     * session : enrichit la session côté client avec les infos multi-tenant
     * Le front utilise ces infos pour savoir dans quelle org il travaille
     */
    async session({ session, token }) {
      if (!session.user?.email) return session;

      // Récupérer l'active_organisation_id du user
      const { data: user } = await supabaseAdmin
        .from('users')
        .select('id, active_organisation_id')
        .eq('email', session.user.email)
        .single();

      if (user) {
        // @ts-ignore — extension de la session
        session.user.id = user.id;
        // @ts-ignore
        session.user.activeOrgId = user.active_organisation_id;

        // Charger les memberships pour le switcher d'organisation
        const { data: memberships } = await supabaseAdmin
          .from('memberships')
          .select('organisation_id, role, organisations ( id, nom, slug )')
          .eq('user_id', user.id)
          .eq('is_active', true);

        // @ts-ignore
        session.user.memberships = memberships || [];
      }

      return session;
    },
  },
  pages: {
    signIn: '/',
  },
};

const handler = NextAuth(authOptions);
export { handler as GET, handler as POST };
