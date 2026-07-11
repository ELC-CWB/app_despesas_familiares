import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 });

    if (!process.env.ANTHROPIC_API_KEY) {
      return NextResponse.json({ error: 'ANTHROPIC_API_KEY não configurada.' }, { status: 500 });
    }

    const { word, context } = (await request.json()) as { word: string; context?: string };
    if (!word?.trim()) return NextResponse.json({ error: 'word required' }, { status: 400 });

    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 80,
        messages: [{
          role: 'user',
          content: `Translate the English word or expression below to Brazilian Portuguese.
If it is a single word, give the direct translation.
If it is an idiom or phrasal verb, give the meaning in Portuguese.
Reply with ONLY the Portuguese translation — no extra text, no quotes, no explanation.

Expression: "${word.trim()}"
Context: "${(context || '').slice(0, 200)}"`,
        }],
      }),
    });

    if (!resp.ok) {
      return NextResponse.json({ error: 'Translation failed' }, { status: 502 });
    }

    const data = await resp.json();
    const block = data.content?.find((b: { type: string }) => b.type === 'text');
    const translation = (block?.text ?? '').trim();
    return NextResponse.json({ translation });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
