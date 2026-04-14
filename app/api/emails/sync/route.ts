import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/app/api/auth/[...nextauth]/route'
import { syncRecentEmails } from '@/lib/gmail'

// POST /api/emails/sync — déclenche une synchronisation Gmail et retourne le nombre d'emails importés
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Non connecte' }, { status: 401 })

  try {
    const count = await syncRecentEmails(session.user.id)
    return NextResponse.json({ ok: true, synced: count ?? 0 })
  } catch (error: any) {
    console.error('Gmail sync error:', error?.message)
    // Retourner 200 avec le message d'erreur pour que le client puisse afficher un feedback
    return NextResponse.json({ ok: false, error: error?.message || 'Erreur synchronisation Gmail' }, { status: 200 })
  }
}
