import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { getGmailClient, parseGmailMessage } from '@/lib/gmail'
import { extractReservationData } from '@/lib/claude'

// Ce endpoint reçoit les notifications Gmail en temps réel via Google Pub/Sub
// Google envoie un POST dès qu'un email arrive dans l'inbox
export async function POST(req: NextRequest) {
  try {
    // Vérifier le secret webhook
    const secret = req.nextUrl.searchParams.get('secret')
    if (secret !== process.env.GMAIL_WEBHOOK_SECRET) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Décoder le message Pub/Sub (base64)
    const body = await req.json()
    const data = JSON.parse(
      Buffer.from(body.message.data, 'base64').toString('utf-8')
    )

    // data contient : { emailAddress, historyId }
    const { emailAddress, historyId } = data

    // Trouver l'utilisateur correspondant à cette adresse email
    const { data: user } = await supabaseAdmin
      .from('users')
      .select('id')
      .eq('email', emailAddress)
      .single()

    if (!user) {
      return NextResponse.json({ ok: true }) // Ignorer silencieusement
    }

    // Récupérer le historyId précédent depuis Supabase
    const { data: meta } = await supabaseAdmin
      .from('gmail_sync')
      .select('last_history_id')
      .eq('user_id', user.id)
      .single()

    const lastHistoryId = meta?.last_history_id || historyId

    // Récupérer les changements depuis le dernier historyId
    const gmail = await getGmailClient(user.id)
    const historyRes = await gmail.users.history.list({
      userId: 'me',
      startHistoryId: lastHistoryId,
      historyTypes: ['messageAdded'],
      labelId: 'INBOX',
    })

    const history = historyRes.data.history || []
    const newMessageIds = new Set<string>()

    for (const h of history) {
      for (const m of h.messagesAdded || []) {
        if (m.message?.id) newMessageIds.add(m.message.id)
      }
    }

    // Charger et stocker chaque nouveau message
    for (const msgId of newMessageIds) {
      const msgRes = await gmail.users.messages.get({
        userId: 'me',
        id: msgId,
        format: 'full',
      })

      const parsed = parseGmailMessage(msgRes.data)

      // Insérer dans Supabase
      const { data: inserted } = await supabaseAdmin
        .from('emails')
        .upsert({ ...parsed, user_id: user.id }, { onConflict: 'gmail_id' })
        .select()
        .single()

      // Analyser automatiquement si c'est une demande événementielle
      if (inserted && parsed.body) {
        const extraction = await extractReservationData(parsed.body)
        if (extraction.isReservation) {
          // Créer automatiquement la fiche événement en brouillon
          await supabaseAdmin.from('evenements').insert({
            user_id: user.id,
            nom: extraction.nom || parsed.from_name,
            email: extraction.email || parsed.from_email,
            telephone: extraction.telephone || '',
            entreprise: extraction.entreprise || '',
            type_evenement: extraction.typeEvenement || '',
            nombre_personnes: extraction.nombrePersonnes,
            espace_id: extraction.espaceDetecte || 'rdc',
            date_debut: extraction.dateDebut || '',
            heure_debut: extraction.heureDebut || '',
            heure_fin: extraction.heureFin || '',
            notes: extraction.notes || '',
            budget: extraction.budget || '',
            statut: 'nouveau',
          })
        }
      }
    }

    // Mettre à jour le historyId
    await supabaseAdmin.from('gmail_sync').upsert({
      user_id: user.id,
      last_history_id: historyId,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id' })

    return NextResponse.json({ ok: true, processed: newMessageIds.size })
  } catch (error) {
    console.error('Webhook Gmail erreur:', error)
    // Retourner 200 quand même pour éviter que Google retry en boucle
    return NextResponse.json({ ok: true })
  }
}
