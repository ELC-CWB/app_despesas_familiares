import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { createAdminClient } from "@/lib/supabase/admin";
import { Card } from "@/components/ui/card";
import type { AppAcesso } from "@/lib/acessos";

export const dynamic = "force-dynamic";

type Linha = {
  id: string;
  nome: string;
  email: string;
  criadoEm: string | null;
  porApp: Record<AppAcesso, { acessos: number; ultimo: string } | null>;
  ultimoAcesso: string | null;
};

const APPS: { id: AppAcesso; nome: string }[] = [
  { id: "despesas", nome: "Despesas" },
  { id: "investimentos", nome: "Investimentos" },
];

const DIA_MS = 24 * 60 * 60 * 1000;

function formatar(data: string | null): string {
  if (!data) return "—";
  return new Date(data).toLocaleString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit",
  });
}

function contarRecentes(datas: (string | null)[], dias: number): number {
  const limite = Date.now() - dias * DIA_MS;
  return datas.filter((d) => d && new Date(d).getTime() >= limite).length;
}

function maisRecente(a: string | null, b: string | null): string | null {
  if (!a) return b;
  if (!b) return a;
  return new Date(a) > new Date(b) ? a : b;
}

export default async function UsuariosPage() {
  const admin = createAdminClient();
  if (!admin) {
    return <div className="p-6 text-sm text-muted-foreground">Chave de serviço não configurada no servidor.</div>;
  }

  const [{ data: lista }, { data: perfis }, { data: acessos }] = await Promise.all([
    admin.auth.admin.listUsers({ page: 1, perPage: 1000 }),
    admin.from("profiles").select("id, name"),
    admin.from("acessos_app").select("user_id, app, acessos, ultimo_acesso"),
  ]);

  const nomes = new Map((perfis ?? []).map((p: { id: string; name: string }) => [p.id, p.name]));
  const regs = new Map<string, { acessos: number; ultimo_acesso: string }>();
  for (const a of (acessos ?? []) as { user_id: string; app: AppAcesso; acessos: number; ultimo_acesso: string }[]) {
    regs.set(`${a.user_id}:${a.app}`, a);
  }

  const linhas: Linha[] = (lista?.users ?? []).map((u) => {
    const porApp = {} as Linha["porApp"];
    let ultimo: string | null = u.last_sign_in_at ?? null;
    for (const { id } of APPS) {
      const reg = regs.get(`${u.id}:${id}`);
      porApp[id] = reg ? { acessos: reg.acessos, ultimo: reg.ultimo_acesso } : null;
      if (reg) ultimo = maisRecente(ultimo, reg.ultimo_acesso);
    }
    return {
      id: u.id,
      nome: nomes.get(u.id) || (u.user_metadata?.name as string | undefined) || "—",
      email: u.email ?? "—",
      criadoEm: u.created_at ?? null,
      porApp,
      ultimoAcesso: ultimo,
    };
  });
  linhas.sort((a, b) => (b.ultimoAcesso ?? "").localeCompare(a.ultimoAcesso ?? ""));

  const ativos7 = contarRecentes(linhas.map((l) => l.ultimoAcesso), 7);
  const novos30 = contarRecentes(linhas.map((l) => l.criadoEm), 30);

  const resumo = [
    { rotulo: "Usuários cadastrados", valor: linhas.length },
    ...APPS.map((a) => ({ rotulo: `Usam ${a.nome}`, valor: linhas.filter((l) => l.porApp[a.id]).length })),
    { rotulo: "Ativos nos últimos 7 dias", valor: ativos7 },
    { rotulo: "Novos nos últimos 30 dias", valor: novos30 },
  ];

  return (
    <div className="p-4 sm:p-6 max-w-5xl mx-auto space-y-5">
      <div className="flex items-center gap-3">
        <Link href="/" className="text-muted-foreground hover:text-foreground" aria-label="Voltar à tela inicial">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div>
          <h1 className="text-xl font-bold">Usuários</h1>
          <p className="text-sm text-muted-foreground">Quem se cadastrou e como tem usado o app.</p>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        {resumo.map((r) => (
          <Card key={r.rotulo} className="p-4">
            <p className="text-xs text-muted-foreground">{r.rotulo}</p>
            <p className="text-2xl font-bold mt-1">{r.valor}</p>
          </Card>
        ))}
      </div>

      <Card className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-muted-foreground border-b border-border">
              <th className="p-3 font-medium">Usuário</th>
              <th className="p-3 font-medium">Cadastro</th>
              <th className="p-3 font-medium text-right">Total de acessos</th>
              {APPS.map((a) => (
                <th key={a.id} className="p-3 font-medium">{a.nome}</th>
              ))}
              <th className="p-3 font-medium">Último acesso</th>
            </tr>
          </thead>
          <tbody>
            {linhas.map((l) => (
              <tr key={l.id} className="border-b border-border last:border-0">
                <td className="p-3">
                  <div className="font-medium">{l.nome}</div>
                  <div className="text-xs text-muted-foreground">{l.email}</div>
                </td>
                <td className="p-3 whitespace-nowrap">{formatar(l.criadoEm)}</td>
                <td className="p-3 text-right font-medium tabular-nums">
                  {APPS.reduce((soma, a) => soma + (l.porApp[a.id]?.acessos ?? 0), 0)}
                </td>
                {APPS.map((a) => {
                  const r = l.porApp[a.id];
                  return (
                    <td key={a.id} className="p-3 whitespace-nowrap">
                      {r ? (
                        <>
                          <div className="font-medium tabular-nums">{r.acessos} {r.acessos === 1 ? "acesso" : "acessos"}</div>
                          <div className="text-xs text-muted-foreground">{formatar(r.ultimo)}</div>
                        </>
                      ) : (
                        "—"
                      )}
                    </td>
                  );
                })}
                <td className="p-3 whitespace-nowrap">{formatar(l.ultimoAcesso)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <p className="text-xs text-muted-foreground">
        Uma visita conta quando o usuário volta ao app depois de mais de 30 minutos parado. A contagem começou quando
        este recurso entrou no ar; antes disso só há o último login registrado. &ldquo;Último acesso&rdquo; considera os dois apps e o último login.
      </p>
    </div>
  );
}
