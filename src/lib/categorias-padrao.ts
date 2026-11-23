import type { SupabaseClient } from "@supabase/supabase-js";
import type { Category, ExpenseType } from "@/types";

const PADRAO: Record<ExpenseType, { label: string; emoji: string; color: string }[]> = {
  despesa: [
    { label: "Moradia", emoji: "🏠", color: "#10b981" },
    { label: "Alimentação", emoji: "🍽️", color: "#3b82f6" },
    { label: "Saúde", emoji: "💊", color: "#ef4444" },
    { label: "Educação", emoji: "📚", color: "#8b5cf6" },
    { label: "Lazer", emoji: "🎉", color: "#f59e0b" },
    { label: "Transporte", emoji: "🚗", color: "#06b6d4" },
    { label: "Outros", emoji: "📦", color: "#6b7280" },
  ],
  receita: [
    { label: "Salário", emoji: "💼", color: "#10b981" },
    { label: "Rendimentos", emoji: "💰", color: "#3b82f6" },
    { label: "Freelance", emoji: "💻", color: "#8b5cf6" },
    { label: "Outros", emoji: "📦", color: "#6b7280" },
  ],
};

// Um grupo novo nasce sem categorias e não dá para lançar despesa ou receita. Cria as categorias padrão
// que faltam (só o administrador do grupo consegue gravar, pelas regras do banco) e devolve a lista do grupo.
export async function garantirCategoriasPadrao(supabase: SupabaseClient, groupId: string): Promise<Category[]> {
  const { data: existentes } = await supabase.from("group_categories").select("*").eq("group_id", groupId).order("position");
  const lista = (existentes ?? []) as Category[];

  const faltam = (["despesa", "receita"] as ExpenseType[]).filter(
    (t) => !lista.some((c) => (c.tipo ?? "despesa") === t)
  );
  if (faltam.length === 0) return lista;

  const novas = faltam.flatMap((t) =>
    PADRAO[t].map((c, position) => ({ group_id: groupId, ...c, position, tipo: t }))
  );
  const { data } = await supabase.from("group_categories").insert(novas).select("*");
  return [...lista, ...((data ?? []) as Category[])];
}
