-- ══════════════════════════════════════════════════════════════════
-- ARCHANGE — Schéma Supabase
-- Exécuter dans Supabase → SQL Editor
-- ══════════════════════════════════════════════════════════════════

-- ─── UTILISATEURS ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id          TEXT PRIMARY KEY,
  email       TEXT UNIQUE NOT NULL,
  name        TEXT,
  image       TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ─── COMPTES OAUTH (tokens Gmail) ─────────────────────────────────
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

-- ─── SYNC GMAIL (historique webhook) ──────────────────────────────
CREATE TABLE IF NOT EXISTS gmail_sync (
  user_id         TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  last_history_id TEXT,
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ─── EMAILS ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS emails (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  gmail_id    TEXT UNIQUE NOT NULL,
  thread_id   TEXT,
  from_name   TEXT NOT NULL,
  from_email  TEXT NOT NULL,
  subject     TEXT,
  snippet     TEXT,
  body        TEXT,
  date        TEXT,
  date_iso    TIMESTAMPTZ,
  is_unread   BOOLEAN DEFAULT TRUE,
  is_starred  BOOLEAN DEFAULT FALSE,
  a_traiter   BOOLEAN DEFAULT FALSE,
  flags       TEXT[] DEFAULT '{}',
  labels      TEXT[] DEFAULT '{}',
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS emails_user_id_idx ON emails(user_id);
CREATE INDEX IF NOT EXISTS emails_date_iso_idx ON emails(date_iso DESC);
CREATE INDEX IF NOT EXISTS emails_is_unread_idx ON emails(is_unread);

-- ─── ÉVÉNEMENTS ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS evenements (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  nom               TEXT NOT NULL,
  email             TEXT,
  telephone         TEXT,
  entreprise        TEXT,
  type_evenement    TEXT,
  nombre_personnes  INTEGER,
  espace_id         TEXT DEFAULT 'rdc',
  date_debut        TEXT,
  heure_debut       TEXT,
  heure_fin         TEXT,
  statut            TEXT DEFAULT 'nouveau',
  notes             TEXT,
  budget            TEXT,
  note_ia           TEXT,
  note_ia_date      TEXT,
  note_directeur    TEXT,
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS evenements_user_id_idx ON evenements(user_id);
CREATE INDEX IF NOT EXISTS evenements_statut_idx ON evenements(statut);

-- ─── STATUTS PERSONNALISÉS ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS statuts (
  id       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id  TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  label    TEXT NOT NULL,
  color    TEXT NOT NULL,
  bg       TEXT NOT NULL,
  ordre    INTEGER DEFAULT 0
);

-- Statuts par défaut (insérer manuellement ou via l'app)
-- INSERT INTO statuts VALUES (gen_random_uuid(), 'USER_ID', 'Nouveau', '#1D4ED8', '#EFF6FF', 0);

-- ─── RELANCES ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS relances (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  evenement_id     UUID REFERENCES evenements(id) ON DELETE CASCADE,
  evenement_nom    TEXT,
  evenement_email  TEXT,
  date             TEXT NOT NULL,
  heure            TEXT,
  note             TEXT,
  done             BOOLEAN DEFAULT FALSE,
  created_at       TIMESTAMPTZ DEFAULT NOW()
);

-- ─── SOURCES IA ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS sources_links (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  key         TEXT NOT NULL,  -- 'website' | 'instagram' | 'facebook' | 'other'
  url         TEXT,
  summary     TEXT,
  fetched_at  TEXT,
  UNIQUE(user_id, key)
);

CREATE TABLE IF NOT EXISTS sources_docs (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  size        INTEGER,
  is_pdf      BOOLEAN DEFAULT FALSE,
  content     TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sources_context (
  user_id  TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  context  TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ─── ROW LEVEL SECURITY ───────────────────────────────────────────
-- Chaque utilisateur ne voit que ses propres données
ALTER TABLE emails          ENABLE ROW LEVEL SECURITY;
ALTER TABLE evenements      ENABLE ROW LEVEL SECURITY;
ALTER TABLE relances        ENABLE ROW LEVEL SECURITY;
ALTER TABLE statuts         ENABLE ROW LEVEL SECURITY;
ALTER TABLE sources_links   ENABLE ROW LEVEL SECURITY;
ALTER TABLE sources_docs    ENABLE ROW LEVEL SECURITY;
ALTER TABLE sources_context ENABLE ROW LEVEL SECURITY;

-- Policies (le service_role bypasse ces policies côté serveur)
CREATE POLICY "users see own emails"
  ON emails FOR ALL USING (user_id = auth.uid()::text);

CREATE POLICY "users see own evenements"
  ON evenements FOR ALL USING (user_id = auth.uid()::text);

CREATE POLICY "users see own relances"
  ON relances FOR ALL USING (user_id = auth.uid()::text);
