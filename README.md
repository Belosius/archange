# ARCHANGE — Agent IA événementiel · RÊVA Paris

Application Next.js avec intégration Gmail temps réel, Claude AI, et Supabase.

---

## 🚀 Déploiement en 5 étapes

### Étape 1 — Google Cloud Console

1. Aller sur https://console.cloud.google.com
2. Créer un nouveau projet : **archange-reva**
3. Activer les APIs :
   - **Gmail API** (APIs & Services → Library → Gmail API → Enable)
   - **Cloud Pub/Sub API** (APIs & Services → Library → Cloud Pub/Sub API → Enable)
4. Créer les credentials OAuth :
   - APIs & Services → Credentials → Create Credentials → OAuth 2.0 Client ID
   - Type : **Web application**
   - Nom : ARCHANGE
   - Authorized redirect URIs :
     - `http://localhost:3000/api/auth/callback/google` (dev)
     - `https://archange.vercel.app/api/auth/callback/google` (prod)
   - Copier **Client ID** et **Client Secret**

### Étape 2 — Google Pub/Sub (webhooks Gmail temps réel)

1. Dans Google Cloud Console → Pub/Sub → Topics → Create Topic
2. Nom : `gmail-archange`
3. Copier le topic name : `projects/archange-reva/topics/gmail-archange`
4. Créer une subscription :
   - Subscriptions → Create Subscription
   - Type : **Push**
   - Endpoint URL : `https://archange.vercel.app/api/webhooks/gmail?secret=TON_SECRET`
5. Autoriser Gmail à publier sur ce topic :
   ```
   gcloud pubsub topics add-iam-policy-binding gmail-archange \
     --member="serviceAccount:gmail-api-push@system.gserviceaccount.com" \
     --role="roles/pubsub.publisher"
   ```

### Étape 3 — Supabase

1. Créer un compte sur https://supabase.com
2. New Project → **archange-reva**
3. SQL Editor → coller et exécuter le contenu de `supabase_schema.sql`
4. Settings → API → copier :
   - **Project URL**
   - **anon public key**
   - **service_role key**

### Étape 4 — Variables d'environnement

Copier `.env.local.example` en `.env.local` et remplir :

```bash
cp .env.local.example .env.local
```

```env
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
NEXTAUTH_SECRET=   # openssl rand -base64 32
NEXTAUTH_URL=http://localhost:3000
NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
ANTHROPIC_API_KEY=...
GMAIL_PUBSUB_TOPIC=projects/archange-reva/topics/gmail-archange
GMAIL_WEBHOOK_SECRET=   # chaîne aléatoire
CRON_SECRET=   # openssl rand -base64 32
```

### Étape 5 — Déploiement Vercel

```bash
# Installer les dépendances
npm install

# Test en local
npm run dev

# Déployer sur Vercel
npx vercel --prod
```

Sur Vercel, ajouter toutes les variables d'environnement dans :
Settings → Environment Variables

---

## 📁 Structure du projet

```
archange/
├── app/
│   ├── page.tsx              # Page login (/)
│   ├── mails/page.tsx        # Section Mails
│   ├── events/page.tsx       # Section Événements
│   ├── planning/page.tsx     # Section Planning
│   ├── stats/page.tsx        # Section Stats
│   ├── sources/page.tsx      # Section Sources IA
│   └── api/
│       ├── auth/[...nextauth]/  # OAuth Google
│       ├── emails/              # CRUD emails
│       ├── events/              # CRUD événements
│       ├── claude/              # Appels Claude AI
│       ├── gmail/send/          # Envoi emails
│       ├── webhooks/gmail/      # Réception webhooks temps réel
│       └── cron/gmail-watch/    # Renouvellement webhook (cron)
├── components/
│   └── layout/
│       ├── Sidebar.tsx          # Navigation latérale
│       └── AppLayout.tsx        # Layout avec guard auth
├── hooks/
│   ├── useEmails.ts             # Emails + Supabase Realtime
│   └── useEvents.ts             # Événements + Supabase Realtime
├── lib/
│   ├── supabase.ts              # Client Supabase
│   ├── gmail.ts                 # Gmail API helpers
│   └── claude.ts                # Anthropic/Claude helpers
├── types/index.ts               # Types TypeScript
├── supabase_schema.sql          # Schéma base de données
├── vercel.json                  # Config cron Vercel
└── .env.local.example           # Variables d'environnement
```

---

## ⚡ Flux temps réel

```
Email reçu sur reva13france@gmail.com
  ↓ (< 3 secondes)
Gmail → Pub/Sub → POST /api/webhooks/gmail
  ↓
Extraction infos (Claude AI)
  ↓
Stockage Supabase
  ↓
Supabase Realtime → WebSocket → App mise à jour
  ↓
Notification dans l'app (et navigateur si autorisé)
```

---

## 💰 Coût

- Vercel : **gratuit** (Hobby plan)
- Supabase : **gratuit** (jusqu'à 50k lignes)
- Google Cloud : **gratuit** (quota généreux)
- Anthropic : selon usage (~$0.003/email traité)

---

## 🛠️ Migration depuis l'artefact

Le fichier `brasserie_mail_agent.tsx` contient toute la logique UI.
Les composants ont été découpés mais la logique reste identique.
La seule vraie différence : `window.storage` → Supabase, `fetch Anthropic direct` → `/api/claude`.
