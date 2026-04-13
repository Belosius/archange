// ─── EMAIL ───────────────────────────────────────────────────────
export interface Email {
  id: string
  gmail_id: string
  thread_id: string
  from_name: string
  from_email: string
  subject: string
  snippet: string
  body: string
  date: string
  date_iso: string
  is_unread: boolean
  is_starred: boolean
  flags: string[]       // 'star' | 'flag' | 'atraiter'
  labels: string[]      // labels Gmail originaux
  created_at: string
}

// ─── ÉVÉNEMENT ───────────────────────────────────────────────────
export interface Evenement {
  id: string
  nom: string
  email: string
  telephone: string
  entreprise: string
  type_evenement: string
  nombre_personnes: number | null
  espace_id: string
  date_debut: string
  heure_debut: string
  heure_fin: string
  statut: string
  notes: string
  budget: string
  note_ia: string | null
  note_ia_date: string | null
  note_directeur: string
  created_at: string
  updated_at: string
}

// ─── RELANCE ─────────────────────────────────────────────────────
export interface Relance {
  id: string
  evenement_id: string
  evenement_nom: string
  evenement_email: string
  date: string
  heure: string
  note: string
  created_at: string
}

// ─── STATUT ──────────────────────────────────────────────────────
export interface Statut {
  id: string
  label: string
  color: string
  bg: string
  ordre: number
}

// ─── SOURCE IA ───────────────────────────────────────────────────
export interface SourceLink {
  key: string           // 'website' | 'instagram' | 'facebook' | 'other'
  url: string
  summary: string | null
  fetched_at: string | null
}

export interface SourceDoc {
  id: string
  name: string
  size: number
  is_pdf: boolean
  content: string
  created_at: string
}
