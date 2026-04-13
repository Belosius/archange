import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import { generateEmailResponse, extractReservationData, generateNoteIA, analyzeLinkContent } from '@/lib/claude'
import { supabaseAdmin } from '@/lib/supabase'

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Non connecté' }, { status: 401 })

  const { action, ...payload } = await req.json()

  try {
    switch (action) {

      // Générer une réponse email
      case 'generate_response': {
        const { emailBody, context } = payload
        const response = await generateEmailResponse(emailBody, context)
        return NextResponse.json({ response })
      }

      // Extraire les infos de réservation
      case 'extract_reservation': {
        const { emailBody } = payload
        const data = await extractReservationData(emailBody)
        return NextResponse.json(data)
      }

      // Générer la note IA d'un événement
      case 'generate_note_ia': {
        const { evenementId } = payload

        // Charger l'événement
        const { data: evt } = await supabaseAdmin
          .from('evenements')
          .select('*')
          .eq('id', evenementId)
          .eq('user_id', session.user.id)
          .single()
        if (!evt) return NextResponse.json({ error: 'Événement non trouvé' }, { status: 404 })

        // Charger les emails liés
        const { data: emails } = await supabaseAdmin
          .from('emails')
          .select('*')
          .eq('user_id', session.user.id)
          .or(`from_email.eq.${evt.email},from_name.ilike.%${evt.nom?.split(' ')[0]}%`)
          .limit(10)

        const note = await generateNoteIA(evt, emails || [])

        // Sauvegarder la note
        await supabaseAdmin
          .from('evenements')
          .update({ note_ia: note, note_ia_date: new Date().toLocaleDateString('fr-FR') })
          .eq('id', evenementId)

        return NextResponse.json({ note })
      }

      // Analyser un lien web (Sources IA)
      case 'analyze_link': {
        const { url, content } = payload
        const summary = await analyzeLinkContent(url, content)
        return NextResponse.json({ summary })
      }

      default:
        return NextResponse.json({ error: 'Action inconnue' }, { status: 400 })
    }
  } catch (error) {
    console.error('Claude API erreur:', error)
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}
