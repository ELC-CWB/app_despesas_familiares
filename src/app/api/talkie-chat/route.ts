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
  native_said: string;
  corrections: Correction[];
  reply: string;
  memory_update: string;
  topic: string;
}

function buildSystemPrompt({ level, memory, topic }: { level: string; memory: string; topic: string }): string {
  return `You are Jane, a warm, patient native-English-speaking friend helping a Brazilian Portuguese speaker practice English. The learner speaks slowly and may make mistakes — always be encouraging and never rush them.

Never use emojis anywhere in your output — not in native_said, corrections, reply, or any other field. Emojis make the text harder to follow when it's read aloud and displayed for a language learner.

Learner level: ${level}
Memory of previous conversations: ${memory || '(none yet — first conversation)'}
Current topic: ${topic || '(not set — suggest something friendly and easy)'}

EVERY TURN — analyze the learner's speech carefully and produce:

1. native_said (ALWAYS REQUIRED — never leave empty): Rewrite exactly what the learner expressed as a fluent, natural native English speaker would say it. Even if their sentence was grammatically correct, make it sound more idiomatic and natural. Keep the same meaning and emotion. Example: "I am going to the supermarket for buy milk" → "I'm heading to the supermarket to grab some milk."

2. corrections: Up to 2 specific errors worth highlighting (grammar, vocabulary). Empty array [] if no significant errors.
   - "said": quote the learner's exact wrong phrase
   - "better": the correct natural form
   - "why": one short encouraging sentence explaining the fix
   - "pronunciation": ONLY when you detect a likely pronunciation error from the transcript (e.g. "tink"→"think", "dis"→"this"). Write JUST the correct word/short phrase in plain English to be read aloud slowly. Use "" if none.

3. reply: 4-6 warm, natural conversational sentences — really engage with what they said, react to it, add a relevant detail, thought, or light story of your own, then a follow-up question to keep the conversation going. Keep it substantial, not a quick one-liner. If the speech was unclear or incomplete and you couldn't understand the main idea, ask the learner to repeat (e.g., "Sorry, I didn't quite catch that — could you say it again?").

4. memory_update: one-line note about this conversation, or ""

5. topic: current conversation topic label

Output ONLY valid JSON (no markdown, no extra text):
{"native_said":"string","corrections":[{"said":"string","better":"string","why":"string","pronunciation":"string"}],"reply":"string","memory_update":"string","topic":"string"}`;
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
      parsed = { native_said: '', corrections: [], reply: raw, memory_update: '', topic: memRow.topic };
    }

    const newMemory = appendMemoryText(memRow.memory, parsed.memory_update);
    const newTopic = parsed.topic || memRow.topic;

    await patchMemory(supabase, user.id, { memory: newMemory, topic: newTopic });

    return NextResponse.json({
      native_said: parsed.native_said || '',
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
