import type { SupabaseClient } from "@supabase/supabase-js";
import type { Category } from "@/types";

const PADRAO = [
  { label: "Moradia", emoji: "🏠", color: "#10b981" },
  { label: "Alimentação", emoji: "🍽️", color: "#3b82f6" },
  { label: "Saúde", emoji: "💊", color: "#ef4444" },
  { label: "Educação", emoji: "📚", color: "#8b5cf6" },
  { label: "Lazer", emoji: "🎉", color: "#f59e0b" },
  { label: "Transporte", emoji: "🚗", color: "#06b6d4" },
  { label: "Outros", emoji: "📦", color: "#6b7280" },
];

// Um grupo novo nasce sem categorias e não dá para lançar despesa. Cria as categorias padrão
// (só o administrador do grupo consegue gravar, pelas regras do banco) e devolve a lista do grupo.
export async function garantirCategoriasPadrao(supabase: SupabaseClient, groupId: string): Promise<Category[]> {
  const { data: existentes } = await supabase.from("group_categories").select("*").eq("group_id", groupId).order("position");
  if (existentes && existentes.length > 0) return existentes as Category[];

  const { data } = await supabase
    .from("group_categories")
    .insert(PADRAO.map((c, position) => ({ group_id: groupId, ...c, position })))
    .select("*")
    .order("position");
  return (data ?? []) as Category[];
}
