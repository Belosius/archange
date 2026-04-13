import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { watchGmailInbox } from '@/lib/gmail'

// Vercel Cron — s'exécute tous les 6 jours
// Le webhook Gmail expire après 7 jours, donc on renouvelle avant
// Configurer dans vercel.json :
// { "crons": [{ "path": "/api/cron/gmail-watch", "schedule": "0 9 */6 * *" }] }
export async function GET(req: NextRequest) {
  // Vérifier que c'est bien Vercel qui appelle
  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Récupérer tous les utilisateurs
  const { data: users } = await supabaseAdmin.from('users').select('id')

  let renewed = 0
  for (const user of users || []) {
    try {
      await watchGmailInbox(user.id)
      renewed++
    } catch (e) {
      console.error(`Renouvellement webhook échoué pour ${user.id}:`, e)
    }
  }

  return NextResponse.json({ renewed, total: users?.length || 0 })
}
