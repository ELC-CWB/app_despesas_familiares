import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { name } = await request.json();
  if (!name?.trim()) return NextResponse.json({ error: "Nome obrigatório" }, { status: 400 });

  const { data: newGroup, error: groupError } = await supabase
    .from("investment_groups")
    .insert({ name: name.trim(), created_by: user.id })
    .select()
    .single();

  if (groupError || !newGroup)
    return NextResponse.json({ error: groupError?.message ?? "Erro ao criar grupo" }, { status: 500 });

  const { error: profileError } = await supabase
    .from("profiles")
    .update({ investment_group_id: newGroup.id })
    .eq("id", user.id);

  if (profileError)
    return NextResponse.json({ error: profileError.message }, { status: 500 });

  return NextResponse.json(newGroup, { status: 201 });
}
