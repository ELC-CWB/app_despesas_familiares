// src/app/api/talkie-chat/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getOrCreateMemory, patchMemory, appendMemoryText } from '@/lib/talkie/memory';

export const runtime = 'nodejs';

interface Correction {
  said: string;
  better: string;
  why?: string;
}

interface TalkieResult {
  corrections: Correction[];
  reply: string;
  memory_update: string;
  topic: string;
}

function buildSystemPrompt({ level, memory, topic }: { level: string; memory: string; topic: string }): string {
  return `You are Alex, a warm, casual native-English-speaking friend having a spoken conversation with a Brazilian Portuguese speaker who is practicing English, often while driving, so replies must be short and easy to follow by ear.

Learner level: ${level}
Memory of previous conversations (may be empty if this is the first time): ${memory || '(none yet — this is the first conversation)'}
Current/preferred topic: ${topic || '(not set — suggest something friendly and easy)'}

Behave like a real friend chatting in the car, not a teacher. Rules:
- Reply ONLY in English, 1-3 short natural sentences, conversational tone.
- If the learner made a notable English mistake, gently note it in the "corrections" field — but do not nitpick tiny things constantly; skip corrections most turns if speech was fine, to keep it encouraging and natural.
- Keep the conversation flowing: react to what they said, then continue naturally, occasionally asking a light follow-up question.
- Never repeat the exact same topic/question from a previous session unless the learner brings it up; use the memory to move the conversation forward.
- Output ONLY valid JSON, no markdown fences, no extra text, matching exactly this schema:
{"corrections": [{"said": "string", "better": "string", "why": "short string"}], "reply": "string", "memory_update": "short string or empty", "topic": "short topic label"}`;
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
