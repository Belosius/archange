import Anthropic from '@anthropic-ai/sdk'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })

const SYSTEM_REVA = `Tu es ARCHANGE, l'assistant IA de la brasserie RÊVA, 133 Avenue de France, 75013 Paris. Tu réponds aux emails de manière humaine, directe et chaleureuse, comme le gérant Olivier.
ESPACES : Rez-de-chaussée (120m², 100 assis, 150 debout), Le Patio (70m², 75 assis, 100 debout, min 30 pers), Le Belvédère (70m², 75 assis, 100 debout, vue BNF, min 30 pers).
Règles : phrases courtes, ton chaleureux, suggère l'espace adapté, 5-10 lignes max. Signature : "Olivier, Rêva"`

const SYSTEM_EXTRACT = `Analyse cet email et retourne UNIQUEMENT un JSON valide sans markdown :
{"isReservation":false,"nom":null,"email":null,"telephone":null,"entreprise":null,"typeEvenement":null,"nombrePersonnes":null,"espaceDetecte":null,"dateDebut":null,"heureDebut":null,"heureFin":null,"notes":null,"budget":null}
isReservation = true si l'email contient une demande d'événement, privatisation, devis ou réservation de groupe.`

const SYSTEM_NOTE_IA = `Tu es un coordinateur événementiel expérimenté. Analyse les échanges emails ci-dessous et rédige une note de briefing concise pour l'équipe RÊVA. Inclus uniquement ce qui est utile opérationnellement : date/heure confirmées, nombre de personnes, espace réservé, type d'événement, prestations demandées (menu, boissons, matériel technique, décoration), contraintes particulières, budget si mentionné, interlocuteur principal et ton général du client. Format : bullet points courts, pas de formules de politesse, juste les faits.`

// ─── Générer une réponse email ────────────────────────────────────
export async function generateEmailResponse(
  emailBody: string,
  context?: string
): Promise<string> {
  const msg = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 1000,
    system: SYSTEM_REVA + (context ? `\n\nContexte supplémentaire:\n${context}` : ''),
    messages: [{ role: 'user', content: emailBody }],
  })
  return msg.content.filter(b => b.type === 'text').map(b => b.text).join('')
}

// ─── Extraire les infos de réservation d'un email ────────────────
export async function extractReservationData(emailBody: string): Promise<any> {
  const msg = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 500,
    system: SYSTEM_EXTRACT,
    messages: [{ role: 'user', content: emailBody }],
  })
  const text = msg.content.filter(b => b.type === 'text').map(b => b.text).join('')
  try {
    return JSON.parse(text.replace(/```json|```/g, '').trim())
  } catch { return { isReservation: false } }
}

// ─── Générer la note IA de briefing ──────────────────────────────
export async function generateNoteIA(
  evenement: any,
  emails: any[],
  docs: any[] = []
): Promise<string> {
  const emailHistory = emails.length > 0
    ? emails.map(m => `---\nDe: ${m.from_name} <${m.from_email}>\nObjet: ${m.subject}\n${m.body}`).join('\n\n')
    : 'Aucun échange email trouvé.'

  const prompt = `Événement: ${evenement.nom}${evenement.entreprise ? ` (${evenement.entreprise})` : ''}
Type: ${evenement.type_evenement || '—'} | Date: ${evenement.date_debut || '—'} | ${evenement.heure_debut || '—'} → ${evenement.heure_fin || '—'}
Espace: ${evenement.espace_id || '—'} | Personnes: ${evenement.nombre_personnes || '—'} | Budget: ${evenement.budget || '—'}
Notes internes: ${evenement.notes || '—'}

Échanges emails:
${emailHistory}`

  const msg = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 800,
    system: SYSTEM_NOTE_IA,
    messages: [{ role: 'user', content: prompt }],
  })
  return msg.content.filter(b => b.type === 'text').map(b => b.text).join('')
}

// ─── Analyser un lien web (Sources IA) ───────────────────────────
export async function analyzeLinkContent(url: string, content: string): Promise<string> {
  const msg = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 400,
    system: 'Tu es un assistant qui résume du contenu web pour aider un restaurateur. Fais un résumé très court (5-8 lignes max) des informations utiles pour RÊVA Paris.',
    messages: [{ role: 'user', content: `URL: ${url}\n\nContenu:\n${content.slice(0, 8000)}` }],
  })
  return msg.content.filter(b => b.type === 'text').map(b => b.text).join('')
}
