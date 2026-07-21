// src/lib/talkie/memory.ts
import { SupabaseClient } from '@supabase/supabase-js';

export interface TalkieMemoryRow {
  user_id: string;
  level: string;
  topic: string;
  memory: string;
  city: string;
  family_context: string;
  updated_at: string;
}

const DEFAULTS = { level: 'intermediário', topic: '', memory: '', city: '', family_context: '' };

export async function getOrCreateMemory(
  supabase: SupabaseClient,
  userId: string
): Promise<TalkieMemoryRow> {
  const { data, error } = await supabase
    .from('talkie_memory')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) throw error;
  if (data) return data as TalkieMemoryRow;

  const { data: created, error: insertError } = await supabase
    .from('talkie_memory')
    .insert({ user_id: userId, ...DEFAULTS })
    .select('*')
    .single();

  if (insertError) throw insertError;
  return created as TalkieMemoryRow;
}

export async function patchMemory(
  supabase: SupabaseClient,
  userId: string,
  patch: Partial<Pick<TalkieMemoryRow, 'level' | 'topic' | 'memory' | 'city' | 'family_context'>>
): Promise<void> {
  const { error } = await supabase
    .from('talkie_memory')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('user_id', userId);
  if (error) throw error;
}

export function appendMemoryText(existing: string, update: string): string {
  if (!update) return existing;
  let merged = existing ? existing + ' | ' + update : update;
  if (merged.length > 2500) merged = merged.slice(merged.length - 2500);
  return merged;
}
