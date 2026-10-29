import { createAdminClient } from "@/lib/supabase/admin";
import { garantirCategoriasPadrao } from "@/lib/categorias-padrao";

// Despesas não exige que o usuário crie um grupo: cada conta ganha um grupo pessoal, só dela, com as
// categorias padrão. Para compartilhar, o usuário convida pessoas para esse grupo em Configurações.
// Roda no servidor com a chave service_role (a conta ainda não tem grupo para as regras do banco).
// Devolve o id do grupo ou null se não foi possível preparar.
export async function garantirGrupoDespesas(userId: string, nome: string): Promise<string | null> {
  const admin = createAdminClient();
  if (!admin) return null;

  const { data: perfil } = await admin.from("profiles").select("group_id, name").eq("id", userId).maybeSingle();
  if (!perfil) return null;
  if (perfil.group_id) return perfil.group_id as string;

  const primeiroNome = (nome || (perfil.name as string) || "").trim().split(/\s+/)[0];
  const { data: grupo, error } = await admin
    .from("groups")
    .insert({ name: primeiroNome ? `Despesas de ${primeiroNome}` : "Minhas despesas", created_by: userId })
    .select("id")
    .single();
  if (error || !grupo) return null;

  const { error: erroPerfil } = await admin.from("profiles").update({ group_id: grupo.id }).eq("id", userId);
  if (erroPerfil) {
    await admin.from("groups").delete().eq("id", grupo.id);
    return null;
  }
  await garantirCategoriasPadrao(admin, grupo.id);
  return grupo.id as string;
}
