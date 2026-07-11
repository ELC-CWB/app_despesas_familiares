// src/app/api/talkie-chat/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getOrCreateMemory, patchMemory, appendMemoryText } from '@/lib/talkie/memory';

export const runtime = 'nodejs';

interface Correction {
  said: string;
  better: string;
  why?: string;
  pronunciation?: string; // word/phrase to read aloud slowly for pronunciation drill
}

interface TalkieResult {
  corrections: Correction[];
  reply: string;
  memory_update: string;
  topic: string;
}

function buildSystemPrompt({ level, memory, topic }: { level: string; memory: string; topic: string }): string {
  return `You are Jane, a warm, patient native-English-speaking friend helping a Brazilian Portuguese speaker practice English. The learner speaks slowly and may make mistakes — always be encouraging and never rush them.

Learner level: ${level}
Memory of previous conversations: ${memory || '(none yet — first conversation)'}
Current topic: ${topic || '(not set — suggest something friendly and easy)'}

YOUR RESPONSE FLOW — follow this order every turn:
1. CORRECTIONS first (grammar, vocabulary, pronunciation) — max 2 per turn, skip if speech was fine
2. REPLY — 2-3 short natural English sentences, conversational, then a light follow-up question

CORRECTION RULES:
- "said": exactly what the learner said that was wrong
- "better": how a native English speaker would naturally say it
- "why": one short sentence explaining the rule or idiom
- "pronunciation": ONLY when you detect a likely pronunciation error from the transcript (e.g. "tink" → "think", "dis" → "this", "I go" → likely mispronounced "going"). Write JUST the correct word or short phrase in plain English to be read aloud slowly for the learner to repeat. Use empty string "" if no pronunciation issue.

IMPORTANT: Be a patient friend, not a grammar robot. Prioritize the most important correction. If the learner expressed their idea clearly even with minor errors, give the better phrasing but keep it encouraging.

Output ONLY valid JSON with no markdown:
{"corrections": [{"said": "string", "better": "string", "why": "string", "pronunciation": "string"}], "reply": "string", "memory_update": "string", "topic": "string"}`;
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 });
    }

    if (!process.env.ANTHROPIC_API_KEY) {
      return NextResponse.json(
        { error: 'ANTHROPIC_API_KEY não configurada nas Environment Variables da Vercel.' },
        { status: 500 }
      );
    }

    const { message } = (await request.json()) as { message: string };

    const memRow = await getOrCreateMemory(supabase, user.id);

    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 1000,
        system: buildSystemPrompt(memRow),
        messages: [{ role: 'user', content: message }],
      }),
    });

    if (!resp.ok) {
      const errText = await resp.text();
      return NextResponse.json(
        { error: `Anthropic API ${resp.status}: ${errText.slice(0, 300)}` },
        { status: 502 }
      );
    }

    const data = await resp.json();
    const block = data.content.find((b: { type: string }) => b.type === 'text');
    let raw: string = block ? block.text : '{}';
    raw = raw.trim().replace(/^```json/i, '').replace(/^```/, '').replace(/```$/, '').trim();

    let parsed: TalkieResult;
    try {
      parsed = JSON.parse(raw);
    } catch {
      parsed = { corrections: [], reply: raw, memory_update: '', topic: memRow.topic };
    }

    const newMemory = appendMemoryText(memRow.memory, parsed.memory_update);
    const newTopic = parsed.topic || memRow.topic;

    await patchMemory(supabase, user.id, { memory: newMemory, topic: newTopic });

    return NextResponse.json({
      corrections: parsed.corrections || [],
      reply: parsed.reply,
      level: memRow.level,
      topic: newTopic,
      memory: newMemory,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
