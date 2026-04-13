import NextAuth, { type NextAuthOptions } from 'next-auth'
import GoogleProvider from 'next-auth/providers/google'
import { supabaseAdmin } from '@/lib/supabase'
import { watchGmailInbox, syncRecentEmails } from '@/lib/gmail'
export const authOptions: NextAuthOptions = {
  providers: [GoogleProvider({ clientId: process.env.GOOGLE_CLIENT_ID!, clientSecret: process.env.GOOGLE_CLIENT_SECRET!, authorization: { params: { scope: ['openid','email','profile','https://www.googleapis.com/auth/gmail.readonly','https://www.googleapis.com/auth/gmail.send','https://www.googleapis.com/auth/gmail.modify'].join(' '), access_type:'offline', prompt:'consent' } } })],
  secret: process.env.NEXTAUTH_SECRET,
  callbacks: {
    async signIn({ user, account }) {
      if (!account || account.provider !== 'google') return false
      await supabaseAdmin.from('users').upsert({ id:user.id, email:user.email, name:user.name, image:user.image, updated_at:new Date().toISOString() }, { onConflict:'id' })
      await supabaseAdmin.from('accounts').upsert({ user_id:user.id, provider:'google', provider_account_id:account.providerAccountId, access_token:account.access_token, refresh_token:account.refresh_token, expires_at:account.expires_at, updated_at:new Date().toISOString() }, { onConflict:'provider_account_id' })
      try { await watchGmailInbox(user.id) } catch(e) { console.error(e) }
      try { await syncRecentEmails(user.id, 50) } catch(e) { console.error(e) }
      return true
    },
    async jwt({ token, user, account }) { if(user) token.userId=user.id; if(account?.access_token) token.accessToken=account.access_token; return token },
    async session({ session, token }) { if(token.userId) (session.user as any).id=token.userId; return session },
  },
  pages: { signIn:'/', error:'/auth/error' },
}
const handler = NextAuth(authOptions)
export { handler as GET, handler as POST }
