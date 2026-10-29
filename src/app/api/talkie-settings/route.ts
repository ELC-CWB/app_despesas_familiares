// src/app/api/talkie-settings/route.ts
import { isPlatformAdmin } from "@/lib/admin";
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getOrCreateMemory, patchMemory } from '@/lib/talkie/memory';

export const runtime = 'nodejs';

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 });
  if (!isPlatformAdmin(user.email)) return NextResponse.json({ error: "Sem acesso." }, { status: 403 });

  try {
    const row = await getOrCreateMemory(supabase, user.id);
    return NextResponse.json(row);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 });
  if (!isPlatformAdmin(user.email)) return NextResponse.json({ error: "Sem acesso." }, { status: 403 });

  try {
    const patch = (await request.json()) as {
      level?: string; topic?: string; memory?: string; city?: string; family_context?: string;
    };
    await patchMemory(supabase, user.id, patch);
    const row = await getOrCreateMemory(supabase, user.id);
    return NextResponse.json(row);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
