/**
 * ═══════════════════════════════════════════════════════════════
 *  /api/emails/deep-search — Recherche directe dans Gmail
 * ═══════════════════════════════════════════════════════════════
 *
 * Pour les recherches qui vont au-delà de emails_cache (par exemple
 * retrouver un ancien mail archivé non cacheable).
 *
 * Query params : q (query Gmail) — ex: from:someone@example.com after:2026/01/01
 */

import { NextRequest, NextResponse } from 'next/server';
import { getOrgContext } from '@/lib/org/getOrgContext';
import { getGmailConnection } from '@/lib/gmail/getGmailConnection';

export async function GET(req: NextRequest) {
  const ctx = await getOrgContext(req);
  if (!ctx) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const url = new URL(req.url);
  const q = url.searchParams.get('q');
  const maxResults = parseInt(url.searchParams.get('maxResults') || '20', 10);
  if (!q) return NextResponse.json({ error: 'q required' }, { status: 400 });

  const conn = await getGmailConnection(ctx.activeOrgId);
  if (!conn) {
    return NextResponse.json({ error: 'No Gmail connection' }, { status: 400 });
  }

  try {
    // 1. Lister les messages matchant la query
    const listUrl = `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${encodeURIComponent(
      q
    )}&maxResults=${maxResults}`;
    const listRes = await fetch(listUrl, {
      headers: { Authorization: `Bearer ${conn.accessToken}` },
    });
    if (!listRes.ok) {
      return NextResponse.json({ error: 'Gmail list failed' }, { status: listRes.status });
    }
    const { messages = [] } = await listRes.json();

    // 2. Fetch détaillé des N premiers messages (en parallèle)
    const details = await Promise.all(
      messages.slice(0, maxResults).map((m: { id: string }) =>
        fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${m.id}?format=metadata`, {
          headers: { Authorization: `Bearer ${conn.accessToken}` },
        }).then((r) => (r.ok ? r.json() : null))
      )
    );

    const validDetails = details.filter(Boolean).map((msg: Record<string, unknown>) => {
      const headers = (msg.payload as { headers?: Array<{ name: string; value: string }> })?.headers || [];
      const getH = (n: string) => headers.find((h) => h.name.toLowerCase() === n.toLowerCase())?.value;
      return {
        id: msg.id,
        threadId: msg.threadId,
        snippet: msg.snippet,
        from: getH('From'),
        to: getH('To'),
        subject: getH('Subject'),
        date: getH('Date'),
      };
    });

    return NextResponse.json({ results: validDetails });
  } catch (err) {
    console.error('[emails/deep-search]', err);
    return NextResponse.json({ error: 'Search failed' }, { status: 500 });
  }
}
