-- ══════════════════════════════════════════════════════════════════
-- ARCHANGE — Schéma Supabase (multi-tenant)
-- Exécuter dans Supabase → SQL Editor
-- ══════════════════════════════════════════════════════════════════
--
-- Architecture multi-tenant :
--   - `organisations` : une par brasserie
--   - `users` : un par humain (peut être membre de N organisations)
--   - `memberships` : lien users ↔ organisations avec un rôle
--     (super_admin, admin, manager, lecture)
--   - Toutes les tables métier filtrent par `organisation_id`
--   - `users.active_organisation_id` : préférence persistée pour le
--     switcher d'organisation côté client
--
-- Les tokens OAuth Gmail sont dans `gmail_connections` attachés à
-- une organisation, plus à un user (permet à toute l'équipe de
-- l'orga d'accéder à la même boîte mail métier).
-- ══════════════════════════════════════════════════════════════════

-- ─── ORGANISATIONS ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS organisations (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name       TEXT NOT NULL,
  nom        TEXT,                                 -- alias FR pour compat code
  slug       TEXT UNIQUE NOT NULL,
  type       TEXT DEFAULT 'brasserie',
  settings   JSONB DEFAULT '{}'::jsonb,
  is_active  BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ─── USERS (humains qui se connectent) ────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id                     TEXT PRIMARY KEY,            -- Google OAuth sub
  email                  TEXT UNIQUE NOT NULL,
  name                   TEXT,
  image                  TEXT,
  active_organisation_id UUID REFERENCES organisations(id) ON DELETE SET NULL,
  created_at             TIMESTAMPTZ DEFAULT NOW(),
  updated_at             TIMESTAMPTZ DEFAULT NOW()
);

-- ─── MEMBERSHIPS (users × organisations × role) ───────────────────
CREATE TABLE IF NOT EXISTS memberships (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  organisation_id UUID NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  role            TEXT NOT NULL CHECK (role IN ('super_admin','admin','manager','lecture')),
  is_active       BOOLEAN DEFAULT TRUE,
  invited_by      TEXT REFERENCES users(id) ON DELETE SET NULL,
  joined_at       TIMESTAMPTZ DEFAULT NOW(),
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, organisation_id)
);
CREATE INDEX IF NOT EXISTS idx_memberships_user_id ON memberships(user_id);
CREATE INDEX IF NOT EXISTS idx_memberships_org_id  ON memberships(organisation_id);

-- ─── ACCOUNTS (NextAuth — compat, plus la source de vérité) ───────
-- Les tokens Gmail métier sont dans gmail_connections.
-- Cette table est conservée pour compat NextAuth, non utilisée par
-- le code métier ARCHANGE.
CREATE TABLE IF NOT EXISTS accounts (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id              TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider             TEXT NOT NULL,
  provider_account_id  TEXT UNIQUE NOT NULL,
  access_token         TEXT,
  refresh_token        TEXT,
  expires_at           BIGINT,
  created_at           TIMESTAMPTZ DEFAULT NOW(),
  updated_at           TIMESTAMPTZ DEFAULT NOW()
);

-- ─── GMAIL CONNECTIONS (boîtes mail métier par organisation) ──────
-- Les colonnes oauth_* sont utilisées par le code (lib/gmail.ts et
-- lib/gmail/getGmailConnection.ts). Les colonnes access_token /
-- refresh_token / expires_at sans préfixe sont des alias historiques
-- conservés pour compat mais le code les ignore.
CREATE TABLE IF NOT EXISTS gmail_connections (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             TEXT NOT NULL,                 -- créateur de la connexion (pas de FK forte)
  organisation_id     UUID NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  email               TEXT NOT NULL,
  label               TEXT,                          -- ex: "Boîte principale"
  is_active           BOOLEAN DEFAULT TRUE,
  -- Tokens OAuth actifs (utilisés par le code)
  oauth_access_token  TEXT,
  oauth_refresh_token TEXT,
  oauth_expires_at    TIMESTAMPTZ,
  -- Colonnes historiques (kept for compat, not read by code)
  access_token        TEXT,
  refresh_token       TEXT,
  expires_at          TIMESTAMPTZ,
  scope               TEXT,
  -- Gmail Push (watch)
  history_id          BIGINT,
  watch_expiry        TIMESTAMPTZ,
  watch_expiration    BIGINT,                        -- historique
  watch_resource_id   TEXT,
  last_sync_at        TIMESTAMPTZ,
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, organisation_id, email)
);
CREATE INDEX IF NOT EXISTS idx_gmail_connections_user_org     ON gmail_connections(user_id, organisation_id);
CREATE INDEX IF NOT EXISTS idx_gmail_connections_email        ON gmail_connections(email);
CREATE INDEX IF NOT EXISTS idx_gmail_connections_expires_at   ON gmail_connections(expires_at);

-- ─── EMAILS_CACHE (cache métier multi-tenant) ─────────────────────
-- Table moderne utilisée par les routes /api/emails et /api/emails/sync.
CREATE TABLE IF NOT EXISTS emails_cache (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         TEXT NOT NULL,                    -- FK symbolique vers super_admin de l'org
  organisation_id UUID REFERENCES organisations(id) ON DELETE CASCADE,
  gmail_id        TEXT NOT NULL,
  thread_id       TEXT,
  history_id      BIGINT,
  from_name       TEXT,
  from_email      TEXT,
  to_addresses    JSONB DEFAULT '[]'::jsonb,
  cc_addresses    JSONB DEFAULT '[]'::jsonb,
  bcc_addresses   JSONB DEFAULT '[]'::jsonb,
  subject         TEXT,
  snippet         TEXT,
  body_html       TEXT,
  body_text       TEXT,
  date_iso        TIMESTAMPTZ,
  labels          JSONB DEFAULT '[]'::jsonb,
  has_attachments BOOLEAN DEFAULT FALSE,
  attachments     JSONB DEFAULT '[]'::jsonb,
  is_unread       BOOLEAN DEFAULT TRUE,
  is_starred      BOOLEAN DEFAULT FALSE,
  is_archived     BOOLEAN DEFAULT FALSE,
  direction       TEXT DEFAULT 'received',          -- 'received' | 'sent'
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(gmail_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_ec_gmail_id       ON emails_cache(gmail_id);
CREATE INDEX IF NOT EXISTS idx_ec_thread         ON emails_cache(user_id, thread_id);
CREATE INDEX IF NOT EXISTS idx_ec_user_date      ON emails_cache(user_id, date_iso DESC);
CREATE INDEX IF NOT EXISTS idx_ec_user_unread    ON emails_cache(user_id, is_unread);
CREATE INDEX IF NOT EXISTS idx_emails_cache_org  ON emails_cache(organisation_id);

-- ─── EMAILS (table legacy, conservée pour l'historique) ───────────
-- Table originale avant l'introduction de emails_cache.
-- Certaines routes (ex. /api/emails/[id] PATCH) lisent encore ici.
CREATE TABLE IF NOT EXISTS emails (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  organisation_id UUID REFERENCES organisations(id) ON DELETE CASCADE,
  gmail_id        TEXT UNIQUE NOT NULL,
  thread_id       TEXT,
  from_name       TEXT NOT NULL,
  from_email      TEXT NOT NULL,
  subject         TEXT,
  snippet         TEXT,
  body            TEXT,
  date            TEXT,
  date_iso        TIMESTAMPTZ,
  is_unread       BOOLEAN DEFAULT TRUE,
  is_starred      BOOLEAN DEFAULT FALSE,
  a_traiter       BOOLEAN DEFAULT FALSE,
  flags           TEXT[] DEFAULT '{}',
  labels          TEXT[] DEFAULT '{}',
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS emails_user_id_idx    ON emails(user_id);
CREATE INDEX IF NOT EXISTS emails_date_iso_idx   ON emails(date_iso DESC);
CREATE INDEX IF NOT EXISTS emails_is_unread_idx  ON emails(is_unread);
CREATE INDEX IF NOT EXISTS idx_emails_org        ON emails(organisation_id);

-- ─── GMAIL_SYNC (legacy, métadonnées sync historiques) ────────────
-- L'état de sync est désormais dans gmail_connections (history_id, watch_expiry, last_sync_at).
-- Cette table reste pour compat mais le code actuel ne l'utilise plus.
CREATE TABLE IF NOT EXISTS gmail_sync (
  user_id         TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  organisation_id UUID REFERENCES organisations(id) ON DELETE CASCADE,
  last_history_id TEXT,
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_gmail_sync_org ON gmail_sync(organisation_id);

-- ─── USER_SETTINGS (legacy, préférences de sync) ──────────────────
-- Également supplanté par gmail_connections, gardé pour compat.
CREATE TABLE IF NOT EXISTS user_settings (
  user_id         TEXT PRIMARY KEY,
  organisation_id UUID REFERENCES organisations(id) ON DELETE CASCADE,
  last_history_id BIGINT,
  sync_completed  BOOLEAN DEFAULT FALSE,
  watch_expiry    TIMESTAMPTZ,
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ─── ÉVÉNEMENTS (réservations/privatisations) ─────────────────────
CREATE TABLE IF NOT EXISTS evenements (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  organisation_id  UUID REFERENCES organisations(id) ON DELETE CASCADE,
  nom              TEXT NOT NULL,
  email            TEXT,
  telephone        TEXT,
  entreprise       TEXT,
  type_evenement   TEXT,
  nombre_personnes INTEGER,
  espace_id        TEXT DEFAULT 'rdc',
  date_debut       TEXT,
  heure_debut      TEXT,
  heure_fin        TEXT,
  statut           TEXT DEFAULT 'nouveau',
  notes            TEXT,
  budget           TEXT,
  note_ia          TEXT,
  note_ia_date     TEXT,
  note_directeur   TEXT,
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  updated_at       TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS evenements_user_id_idx ON evenements(user_id);
CREATE INDEX IF NOT EXISTS evenements_statut_idx  ON evenements(statut);
CREATE INDEX IF NOT EXISTS idx_evenements_org     ON evenements(organisation_id);

-- ─── STATUTS (personnalisables par organisation) ──────────────────
CREATE TABLE IF NOT EXISTS statuts (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  organisation_id UUID REFERENCES organisations(id) ON DELETE CASCADE,
  label           TEXT NOT NULL,
  color           TEXT NOT NULL,
  bg              TEXT NOT NULL,
  ordre           INTEGER DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_statuts_org ON statuts(organisation_id);

-- ─── RELANCES ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS relances (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  organisation_id UUID REFERENCES organisations(id) ON DELETE CASCADE,
  evenement_id    UUID REFERENCES evenements(id) ON DELETE CASCADE,
  evenement_nom   TEXT,
  evenement_email TEXT,
  date            TEXT NOT NULL,
  heure           TEXT,
  note            TEXT,
  done            BOOLEAN DEFAULT FALSE,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_relances_org ON relances(organisation_id);

-- ─── SOURCES ARCHANGE (contexte IA éditable par les admins) ───────
CREATE TABLE IF NOT EXISTS sources_links (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  organisation_id UUID REFERENCES organisations(id) ON DELETE CASCADE,
  key             TEXT NOT NULL,                    -- 'website'|'instagram'|'facebook'|'other'
  url             TEXT,
  summary         TEXT,
  fetched_at      TEXT,
  UNIQUE(user_id, key)
);

CREATE TABLE IF NOT EXISTS sources_docs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  organisation_id UUID REFERENCES organisations(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  size            INTEGER,
  is_pdf          BOOLEAN DEFAULT FALSE,
  content         TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sources_context (
  user_id         TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  organisation_id UUID REFERENCES organisations(id) ON DELETE CASCADE,
  context         TEXT,
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ─── USER_DATA (blob JSON métier par organisation) ────────────────
-- Stocke les réservations, statuts, relances, contexte IA, règles
-- commerciales, sources ARCHANGE, etc. dans des colonnes TEXT
-- contenant des JSON sérialisés.
--
-- IMPORTANT : 1 seule ligne par organisation_id (contrainte UNIQUE).
-- Le champ user_id pointe vers le super_admin de l'org pour les FK.
CREATE TABLE IF NOT EXISTS user_data (
  user_id             TEXT PRIMARY KEY,
  organisation_id     UUID DEFAULT '550e8400-e29b-41d4-a716-446655440000'::uuid,
  role                TEXT DEFAULT 'manager',
  -- Données métier (JSON sérialisés en TEXT)
  resas               TEXT DEFAULT '[]',
  docs                TEXT DEFAULT '[]',
  links               TEXT DEFAULT '{}',
  links_fetched       TEXT DEFAULT '{}',
  context             TEXT DEFAULT '',
  statuts             TEXT DEFAULT '[]',
  relances            TEXT DEFAULT '[]',
  note_ia             TEXT DEFAULT '{}',
  email_resa_links    TEXT DEFAULT '{}',
  motifs_relance      TEXT DEFAULT '[]',
  extractions         TEXT,
  replies_cache       TEXT,
  radar_traites       TEXT,
  email_meta          TEXT,
  sent_replies        TEXT,
  custom_tags         TEXT,
  email_tags          TEXT,
  -- Sources ARCHANGE (édition réservée aux admins)
  espaces             TEXT,
  regles_commerciales TEXT,
  ton_style           TEXT,
  apprentissages      TEXT,
  cas_particuliers    TEXT,
  regles_absolues     TEXT,
  updated_at          TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(organisation_id)
);
CREATE INDEX IF NOT EXISTS idx_user_data_organisation_id ON user_data(organisation_id);
CREATE INDEX IF NOT EXISTS idx_user_data_role            ON user_data(role);

-- ─── ACTIVITY_LOGS (audit trail par organisation) ─────────────────
CREATE TABLE IF NOT EXISTS activity_logs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         TEXT NOT NULL,                    -- peut être null pour les webhooks
  organisation_id UUID NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  action          TEXT NOT NULL,                    -- 'email.sent', 'event.created', etc.
  resource_type   TEXT,
  resource_id     TEXT,
  metadata        JSONB DEFAULT '{}'::jsonb,
  ip_address      TEXT,
  user_agent      TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_activity_logs_user_org    ON activity_logs(user_id, organisation_id);
CREATE INDEX IF NOT EXISTS idx_activity_logs_action      ON activity_logs(action);
CREATE INDEX IF NOT EXISTS idx_activity_logs_created_at  ON activity_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_activity_logs_resource    ON activity_logs(resource_type, resource_id);

-- ══════════════════════════════════════════════════════════════════
-- SEED — Organisation par défaut pour un fresh install en mode solo
-- ══════════════════════════════════════════════════════════════════
-- Décommenter et adapter pour un premier setup :
--
-- INSERT INTO organisations (id, name, nom, slug) VALUES
--   ('550e8400-e29b-41d4-a716-446655440000', 'Ma Brasserie', 'Ma Brasserie', 'ma-brasserie');
--
-- Les statuts par défaut et le premier membership super_admin sont
-- créés automatiquement par le flow d'onboarding au premier login.
-- ══════════════════════════════════════════════════════════════════
