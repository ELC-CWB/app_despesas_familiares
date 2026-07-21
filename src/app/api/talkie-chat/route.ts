// src/app/api/talkie-chat/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getOrCreateMemory, patchMemory, appendMemoryText } from '@/lib/talkie/memory';
import { buildToolsForUser, executeTool, type ToolCtx } from '@/lib/talkie/tools';

export const runtime = 'nodejs';

const MODEL = 'claude-sonnet-4-6';
const MAX_TOKENS = 1500;
const MAX_TOOL_ITERATIONS = 4; // 4 tool round-trips + 1 forced-final call = 5 API calls max

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
  language: 'en' | 'pt';
}

function buildSystemPrompt({
  level, memory, topic, city, family_context, isGreeting, language,
}: { level: string; memory: string; topic: string; city: string; family_context: string; isGreeting: boolean; language: 'en' | 'pt' }): string {
  const contextBlock = isGreeting
    ? `This is a brand-new conversation session starting right now. You have no memory of any earlier conversation for this greeting — do not reference, mention, or resume any previous subject, and do not propose or suggest a topic yourself. If the learner wants to continue a previous subject, they will bring it up themselves.`
    : `Memory of previous conversations: ${memory || '(none yet — first conversation)'}
Current topic: ${topic || '(not set — suggest something friendly and easy)'}`;

  const languageBlock = language === 'pt'
    ? `LANGUAGE MODE: The conversation is currently in BRAZILIAN PORTUGUESE, at the learner's request. Write "reply" entirely in natural Brazilian Portuguese. Since Portuguese is the learner's native language, this is NOT an English exercise right now — set "native_said" to "" and "corrections" to [] while in this mode; do not correct their Portuguese. Keep being warm and helpful, including as their personal assistant (expenses, investments, weather, holidays) when relevant. If the learner asks to go back to English (e.g. "let's speak English", "posso praticar inglês de novo", "volta pro inglês"), acknowledge briefly in Portuguese and set "language" to "en" in your JSON output — the switch takes effect on the next turn.`
    : `LANGUAGE MODE: The conversation is in ENGLISH — this is the default English-practice mode described below. If the learner asks to switch to Portuguese (e.g. "let's talk in Portuguese", "posso falar português?", "muda pra português", "fala comigo em português"), acknowledge briefly, and set "language" to "pt" in your JSON output so the rest of the conversation continues in Portuguese from the next turn.`;

  return `You are Jane, a warm, patient native-English-speaking friend helping a Brazilian Portuguese speaker practice English. The learner speaks slowly and may make mistakes — always be encouraging and never rush them.

Never use emojis anywhere in your output — not in native_said, corrections, reply, or any other field. Emojis make the text harder to follow when it's read aloud and displayed for a language learner.

You are also the learner's personal assistant. You have tools that look up real data — the family's expenses, investment portfolio, weather, and Brazilian holidays. Use them whenever the user's question depends on real, current, or personal data rather than general conversation — never invent numbers, dates, or events. You may call more than one tool in the same turn if needed. No matter how many tool calls you make, your final reply to the user must always be exactly the JSON object described below — a tool call is never a substitute for that final answer.

${languageBlock}

Learner level: ${level}
Family context (for your awareness — mention it only when naturally relevant, never force it in): ${family_context || '(none provided)'}
${city ? `Learner's city (default for weather questions): ${city}` : ''}
${contextBlock}

EVERY TURN (when in English mode) — analyze the learner's speech carefully and produce:

1. native_said (REQUIRED in English mode, "" in Portuguese mode): Rewrite exactly what the learner expressed as a fluent, natural native English speaker would say it. Even if their sentence was grammatically correct, make it sound more idiomatic and natural. Keep the same meaning and emotion. Example: "I am going to the supermarket for buy milk" → "I'm heading to the supermarket to grab some milk."

2. corrections: Up to 2 specific errors worth highlighting (grammar, vocabulary). Empty array [] if no significant errors, or if in Portuguese mode.
   - "said": quote the learner's exact wrong phrase
   - "better": the correct natural form
   - "why": one short encouraging sentence explaining the fix
   - "pronunciation": ONLY when you detect a likely pronunciation error from the transcript (e.g. "tink"→"think", "dis"→"this"). Write JUST the correct word/short phrase in plain English to be read aloud slowly. Use "" if none.

3. reply: In English mode, 4-6 warm, natural conversational sentences — really engage with what they said, react to it, add a relevant detail, thought, or light story of your own, then a follow-up question to keep the conversation going. Keep it substantial, not a quick one-liner. If the speech was unclear or incomplete and you couldn't understand the main idea, ask the learner to repeat (e.g., "Sorry, I didn't quite catch that — could you say it again?"). If you looked up real data via a tool, weave it naturally into this reply. In Portuguese mode, same spirit but written entirely in Portuguese.

4. memory_update: one-line note about this conversation, or ""

5. topic: current conversation topic label

6. language: "en" or "pt" — the language the conversation should continue in starting next turn (see LANGUAGE MODE above).

Output ONLY valid JSON (no markdown, no extra text):
{"native_said":"string","corrections":[{"said":"string","better":"string","why":"string","pronunciation":"string"}],"reply":"string","memory_update":"string","topic":"string","language":"en"}`;
}

async function callAnthropic(system: string, messages: unknown[], tools: unknown[], forceFinal: boolean) {
  const body: Record<string, unknown> = { model: MODEL, max_tokens: MAX_TOKENS, system, messages };
  if (tools.length) {
    body.tools = tools;
    if (forceFinal) body.tool_choice = { type: 'none' };
  }
  const resp = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY!,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify(body),
  });
  if (!resp.ok) {
    const errText = await resp.text();
    throw new Error(`Anthropic API ${resp.status}: ${errText.slice(0, 300)}`);
  }
  return resp.json();
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

    const { message, greeting, language } = (await request.json()) as { message: string; greeting?: boolean; language?: 'en' | 'pt' };
    const isGreeting = !!greeting;
    const currentLanguage: 'en' | 'pt' = language === 'pt' ? 'pt' : 'en';

    const memRow = await getOrCreateMemory(supabase, user.id);
    const system = buildSystemPrompt({ ...memRow, isGreeting, language: currentLanguage });
    const tools = buildToolsForUser();
    const ctx: ToolCtx = { supabase, userId: user.id, memRow };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const messages: any[] = [{ role: 'user', content: message }];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let data: any;
    let iterations = 0;

    while (true) {
      const forceFinal = iterations >= MAX_TOOL_ITERATIONS;
      data = await callAnthropic(system, messages, tools, forceFinal);

      if (data.stop_reason !== 'tool_use') break;

      iterations++;
      messages.push({ role: 'assistant', content: data.content });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const toolUseBlocks = data.content.filter((b: any) => b.type === 'tool_use');
      const toolResults = await Promise.all(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        toolUseBlocks.map(async (block: any) => {
          try {
            const result = await executeTool(block.name, block.input, ctx);
            return { type: 'tool_result', tool_use_id: block.id, content: JSON.stringify(result) };
          } catch (err) {
            const msg = err instanceof Error ? err.message : 'Tool execution failed.';
            return { type: 'tool_result', tool_use_id: block.id, content: msg, is_error: true };
          }
        })
      );
      messages.push({ role: 'user', content: toolResults });
    }

    const block = data.content.find((b: { type: string }) => b.type === 'text');
    let raw: string = block ? block.text : '{}';
    raw = raw.trim().replace(/^```json/i, '').replace(/^```/, '').replace(/```$/, '').trim();

    let parsed: TalkieResult;
    try {
      parsed = JSON.parse(raw);
    } catch {
      parsed = { native_said: '', corrections: [], reply: raw, memory_update: '', topic: memRow.topic, language: currentLanguage };
    }

    const newMemory = appendMemoryText(memRow.memory, parsed.memory_update);
    // The greeting turn is instructed not to pick a topic — keep whatever was
    // persisted (or blank) until the learner actually starts talking about something.
    const newTopic = isGreeting ? memRow.topic : (parsed.topic || memRow.topic);
    const newLanguage: 'en' | 'pt' = parsed.language === 'pt' ? 'pt' : 'en';

    await patchMemory(supabase, user.id, { memory: newMemory, topic: newTopic });

    return NextResponse.json({
      native_said: parsed.native_said || '',
      corrections: parsed.corrections || [],
      reply: parsed.reply,
      level: memRow.level,
      topic: newTopic,
      memory: newMemory,
      language: newLanguage,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
