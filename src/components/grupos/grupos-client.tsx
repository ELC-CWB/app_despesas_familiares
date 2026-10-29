"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { getInitials } from "@/lib/utils";
import { garantirCategoriasPadrao } from "@/lib/categorias-padrao";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { UserPlus, Users, Mail, Check, Crown, Loader2, Trash2, LogOut, Pencil, X } from "lucide-react";

export type Tipo = "despesas" | "investimentos";
export type GrupoDados = {
  grupo: { id: string; name: string; created_by: string | null } | null;
  membros: { id: string; name: string; email: string }[];
  convites: { id: string; invited_email: string }[];
  meusConvites: { id: string; group_id: string; nome: string }[];
};

// Despesas e Investimentos usam tabelas parecidas; só os nomes e os textos mudam
const CONFIG = {
  despesas: {
    titulo: "Grupo de Despesas",
    descricao: "Quem participa do grupo vê e lança as despesas da família.",
    cor: "#10b981",
    tabelaGrupo: "groups",
    tabelaConvites: "group_invites",
    colunaPerfil: "group_id",
    rpcRemover: "remove_group_member",
    textoCriar: "Crie um grupo para compartilhar as despesas com sua família.",
    textoRemover: "Todos os lançamentos deste usuário no grupo também serão excluídos. Esta ação não pode ser desfeita.",
    textoSair: "Você deixará de ver as despesas do grupo. Os lançamentos que você fez continuam no grupo. Poderá ser convidado novamente pelo administrador.",
    textoExcluir: "Todos os membros serão removidos e TODAS as despesas lançadas neste grupo serão apagadas definitivamente. Esta ação não pode ser desfeita.",
  },
  investimentos: {
    titulo: "Grupo de Investimentos",
    descricao: "Os membros do grupo veem a carteira do administrador, somente para consulta.",
    cor: "#3b82f6",
    tabelaGrupo: "investment_groups",
    tabelaConvites: "investment_group_invites",
    colunaPerfil: "investment_group_id",
    rpcRemover: "remove_investment_group_member",
    textoCriar: "Crie um grupo para compartilhar a sua carteira de investimentos, somente para consulta.",
    textoRemover: "Ele deixará de ver a carteira do grupo. Esta ação não pode ser desfeita.",
    textoSair: "Você deixará de ver a carteira compartilhada do grupo. Poderá ser convidado novamente pelo administrador.",
    textoExcluir: "Todos os membros serão removidos e perderão o acesso à carteira compartilhada. Os seus dados de investimentos não são apagados.",
  },
} as const;

const CORES_USUARIO = ["#10b981", "#3b82f6", "#8b5cf6", "#f59e0b", "#ef4444", "#06b6d4"];

function GrupoSecao({ tipo, dados, userId }: { tipo: Tipo; dados: GrupoDados; userId: string }) {
  const cfg = CONFIG[tipo];
  const { grupo, membros, convites, meusConvites } = dados;
  const router = useRouter();
  const { toast } = useToast();
  const isAdmin = !!grupo && grupo.created_by === userId;

  const [nomeNovo, setNomeNovo] = useState("");
  const [criando, setCriando] = useState(false);
  const [editando, setEditando] = useState(false);
  const [nomeEdicao, setNomeEdicao] = useState("");
  const [salvandoNome, setSalvandoNome] = useState(false);
  const [emailConvite, setEmailConvite] = useState("");
  const [convidando, setConvidando] = useState(false);
  const [aceitandoId, setAceitandoId] = useState<string | null>(null);
  const [removendoId, setRemovendoId] = useState<string | null>(null);
  const [confirmarRemover, setConfirmarRemover] = useState<{ id: string; name: string } | null>(null);
  const [confirmarSair, setConfirmarSair] = useState(false);
  const [saindo, setSaindo] = useState(false);
  const [confirmarExcluir, setConfirmarExcluir] = useState(false);
  const [nomeConfirmacao, setNomeConfirmacao] = useState("");
  const [excluindo, setExcluindo] = useState(false);

  function erro(titulo: string, descricao?: string) {
    toast({ variant: "destructive", title: titulo, description: descricao });
  }

  async function criar() {
    const nome = nomeNovo.trim();
    if (!nome) return;
    setCriando(true);
    const supabase = createClient();
    if (tipo === "despesas") {
      const { data: novo, error } = await supabase.from("groups").insert({ name: nome, created_by: userId }).select().single();
      if (error || !novo) { setCriando(false); erro("Erro ao criar grupo", error?.message); return; }
      const { error: erroPerfil } = await supabase.from("profiles").update({ group_id: novo.id }).eq("id", userId);
      if (erroPerfil) { setCriando(false); erro("Erro ao criar grupo", erroPerfil.message); return; }
      await garantirCategoriasPadrao(supabase, novo.id);
    } else {
      const { error } = await supabase.rpc("create_investment_group", { group_name: nome });
      if (error) { setCriando(false); erro("Erro ao criar grupo", error.message); return; }
    }
    setCriando(false);
    setNomeNovo("");
    toast({ title: "Grupo criado!" });
    router.refresh();
  }

  async function renomear() {
    const nome = nomeEdicao.trim();
    if (!grupo || !nome) return;
    if (nome === grupo.name) { setEditando(false); return; }
    setSalvandoNome(true);
    const supabase = createClient();
    const { error } = await supabase.from(cfg.tabelaGrupo).update({ name: nome }).eq("id", grupo.id);
    setSalvandoNome(false);
    if (error) { erro("Erro ao renomear", error.message); return; }
    setEditando(false);
    toast({ title: "Nome do grupo atualizado!" });
    router.refresh();
  }

  async function convidar() {
    const email = emailConvite.trim().toLowerCase();
    if (!email || !grupo) return;
    setConvidando(true);
    const supabase = createClient();
    const { data: existente } = await supabase.from("profiles").select("id").eq("email", email).eq(cfg.colunaPerfil, grupo.id).maybeSingle();
    if (existente) {
      setConvidando(false);
      erro("Já é membro", "Este usuário já pertence ao grupo.");
      return;
    }
    const { error } = await supabase.from(cfg.tabelaConvites).insert({ group_id: grupo.id, invited_email: email, invited_by: userId });
    setConvidando(false);
    if (error) { erro("Erro ao convidar", error.message); return; }
    toast({ title: "Convite enviado!", description: `Convite enviado para ${email}.` });
    setEmailConvite("");
    router.refresh();
  }

  async function aceitar(conviteId: string, grupoId: string) {
    setAceitandoId(conviteId);
    const supabase = createClient();
    await supabase.from(cfg.tabelaConvites).update({ accepted: true }).eq("id", conviteId);
    const { error } = await supabase.from("profiles").update({ [cfg.colunaPerfil]: grupoId }).eq("id", userId);
    setAceitandoId(null);
    if (error) { erro("Erro ao aceitar convite", error.message); return; }
    toast({ title: "Convite aceito!", description: "Você entrou no grupo." });
    router.refresh();
  }

  async function remover(id: string, nome: string) {
    if (!grupo) return;
    setRemovendoId(id);
    const supabase = createClient();
    const { error } = await supabase.rpc(cfg.rpcRemover, { member_id: id, grp_id: grupo.id });
    setRemovendoId(null);
    if (error) { erro("Erro ao remover membro", error.message); return; }
    toast({ title: "Membro removido", description: `${nome} foi removido do grupo.` });
    router.refresh();
  }

  async function sair() {
    setSaindo(true);
    const supabase = createClient();
    const { error } = await supabase.from("profiles").update({ [cfg.colunaPerfil]: null }).eq("id", userId);
    setSaindo(false);
    if (error) { erro("Erro ao sair do grupo", error.message); return; }
    toast({ title: "Você saiu do grupo." });
    router.refresh();
  }

  async function excluir() {
    if (!grupo) return;
    setExcluindo(true);
    const supabase = createClient();
    const { error } = await supabase.rpc("grupo_excluir", { p_tipo: tipo, p_grupo: grupo.id });
    setExcluindo(false);
    if (error) { erro("Erro ao excluir grupo", error.message); return; }
    setConfirmarExcluir(false);
    toast({ title: "Grupo excluído." });
    router.refresh();
  }

  const nomeConfere = !!grupo && nomeConfirmacao.trim().toLowerCase() === grupo.name.trim().toLowerCase();

  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-base font-semibold flex items-center gap-2" style={{ fontFamily: "Sora, sans-serif" }}>
          <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: cfg.cor }} />
          {cfg.titulo}
        </h2>
        <p className="text-sm text-muted-foreground">{cfg.descricao}</p>
      </div>

      {meusConvites.length > 0 && (
        <Card className="rounded-2xl" style={{ borderColor: `${cfg.cor}4d`, backgroundColor: `${cfg.cor}0d` }}>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Mail className="h-4 w-4" style={{ color: cfg.cor }} />
              Convites para você
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {meusConvites.map((c) => (
              <div key={c.id} className="flex items-center justify-between gap-3 p-3 bg-background rounded-lg border border-border">
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{c.nome}</p>
                  <p className="text-xs text-muted-foreground">Você foi convidado para este grupo</p>
                </div>
                <Button size="sm" onClick={() => aceitar(c.id, c.group_id)} disabled={aceitandoId === c.id}
                  className="gap-1.5 flex-shrink-0 text-white" style={{ backgroundColor: cfg.cor }}>
                  {aceitandoId === c.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                  Aceitar
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {grupo ? (
        <Card className="rounded-2xl">
          <CardHeader>
            {editando ? (
              <div className="flex items-center gap-2">
                <Input value={nomeEdicao} onChange={(e) => setNomeEdicao(e.target.value)} className="min-w-0"
                  aria-label="Nome do grupo" onKeyDown={(e) => { if (e.key === "Enter") renomear(); if (e.key === "Escape") setEditando(false); }} autoFocus />
                <Button size="icon" className="h-9 w-9 flex-shrink-0 text-white" style={{ backgroundColor: cfg.cor }}
                  onClick={renomear} disabled={salvandoNome || !nomeEdicao.trim()} aria-label="Salvar nome">
                  {salvandoNome ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                </Button>
                <Button size="icon" variant="outline" className="h-9 w-9 flex-shrink-0" onClick={() => setEditando(false)} aria-label="Cancelar">
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ) : (
              <CardTitle className="text-base flex items-center gap-2">
                <Users className="h-4 w-4 flex-shrink-0" style={{ color: cfg.cor }} />
                <span className="truncate">{grupo.name}</span>
                {isAdmin && (
                  <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground flex-shrink-0"
                    onClick={() => { setNomeEdicao(grupo.name); setEditando(true); }} aria-label="Editar nome do grupo">
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                )}
              </CardTitle>
            )}
            <CardDescription>{membros.length} membro{membros.length !== 1 ? "s" : ""}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="space-y-2">
              {membros.map((m, i) => (
                <div key={m.id} className="flex items-center gap-3 p-2.5 rounded-lg hover:bg-secondary/50">
                  <Avatar className="h-8 w-8">
                    <AvatarFallback className="text-xs font-semibold text-white" style={{ backgroundColor: CORES_USUARIO[i % CORES_USUARIO.length] }}>
                      {getInitials(m.name)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">
                      {m.name}
                      {m.id === userId && <span className="text-muted-foreground ml-1">(eu)</span>}
                    </p>
                    <p className="text-xs text-muted-foreground truncate">{m.email}</p>
                  </div>
                  {m.id === grupo.created_by ? (
                    <Badge variant="secondary" className="text-xs gap-1 flex-shrink-0"><Crown className="h-3 w-3" /> Admin</Badge>
                  ) : isAdmin && (
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive flex-shrink-0"
                      onClick={() => setConfirmarRemover({ id: m.id, name: m.name })} disabled={removendoId === m.id} aria-label={`Remover ${m.name}`}>
                      {removendoId === m.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                    </Button>
                  )}
                </div>
              ))}
            </div>

            {convites.length > 0 && (
              <>
                <Separator />
                <div>
                  <p className="text-sm font-medium text-muted-foreground mb-2">Convites pendentes</p>
                  <div className="space-y-1.5">
                    {convites.map((c) => (
                      <div key={c.id} className="flex items-center gap-2 text-sm text-muted-foreground px-2">
                        <Mail className="h-3.5 w-3.5" />
                        <span className="truncate">{c.invited_email}</span>
                        <Badge variant="outline" className="text-xs ml-auto">Pendente</Badge>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}

            {isAdmin && (
              <>
                <Separator />
                <div className="space-y-2">
                  <Label htmlFor={`convite-${tipo}`}>Convidar novo membro</Label>
                  <div className="flex flex-col sm:flex-row gap-2">
                    <Input id={`convite-${tipo}`} type="email" placeholder="email@exemplo.com" value={emailConvite}
                      onChange={(e) => setEmailConvite(e.target.value)} onKeyDown={(e) => e.key === "Enter" && convidar()} className="min-w-0" />
                    <Button onClick={convidar} disabled={convidando || !emailConvite.trim()} className="gap-1.5 sm:flex-shrink-0 text-white" style={{ backgroundColor: cfg.cor }}>
                      {convidando ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
                      Convidar
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">A pessoa precisa estar cadastrada no app, com este mesmo e-mail, para aceitar o convite.</p>
                </div>
              </>
            )}

            <Separator />
            {isAdmin ? (
              <Button variant="outline" className="gap-2 text-destructive border-destructive/40 hover:bg-destructive/10 hover:text-destructive"
                onClick={() => { setNomeConfirmacao(""); setConfirmarExcluir(true); }} disabled={excluindo}>
                <Trash2 className="h-4 w-4" />
                Excluir grupo
              </Button>
            ) : (
              <Button variant="outline" className="gap-2 text-destructive border-destructive/40 hover:bg-destructive/10 hover:text-destructive"
                onClick={() => setConfirmarSair(true)} disabled={saindo}>
                <LogOut className="h-4 w-4" />
                Sair do grupo
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <Card className="rounded-2xl">
          <CardHeader>
            <CardTitle className="text-base">Criar grupo</CardTitle>
            <CardDescription>{cfg.textoCriar} Ou aguarde o convite de alguém que já usa o app.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-1.5">
            <Label htmlFor={`novo-${tipo}`}>Nome do grupo</Label>
            <div className="flex flex-col sm:flex-row gap-2">
              <Input id={`novo-${tipo}`} placeholder="Ex: Família Silva" value={nomeNovo} onChange={(e) => setNomeNovo(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && criar()} className="min-w-0" />
              <Button onClick={criar} disabled={criando || !nomeNovo.trim()} className="sm:flex-shrink-0 text-white" style={{ backgroundColor: cfg.cor }}>
                {criando ? <Loader2 className="h-4 w-4 animate-spin" /> : "Criar"}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <Dialog open={confirmarExcluir} onOpenChange={setConfirmarExcluir}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Excluir o grupo?</DialogTitle>
            <DialogDescription>
              <strong>{grupo?.name}</strong>: {cfg.textoExcluir}
            </DialogDescription>
          </DialogHeader>
          {tipo === "despesas" && (
            <div className="space-y-1.5">
              <Label htmlFor="confirma-nome">Para confirmar, digite o nome do grupo</Label>
              <Input id="confirma-nome" value={nomeConfirmacao} onChange={(e) => setNomeConfirmacao(e.target.value)} placeholder={grupo?.name} autoComplete="off" />
            </div>
          )}
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setConfirmarExcluir(false)}>Cancelar</Button>
            <Button variant="destructive" disabled={excluindo || (tipo === "despesas" && !nomeConfere)} onClick={excluir}>
              {excluindo ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Excluir grupo
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={confirmarSair} onOpenChange={setConfirmarSair}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Sair do grupo?</DialogTitle>
            <DialogDescription>{cfg.textoSair}</DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setConfirmarSair(false)}>Cancelar</Button>
            <Button variant="destructive" disabled={saindo} onClick={() => { setConfirmarSair(false); sair(); }}>
              {saindo ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Sair do grupo
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!confirmarRemover} onOpenChange={(o) => { if (!o) setConfirmarRemover(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Remover membro?</DialogTitle>
            <DialogDescription>
              Remover <strong>{confirmarRemover?.name}</strong> do grupo? {cfg.textoRemover}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setConfirmarRemover(null)}>Cancelar</Button>
            <Button variant="destructive" disabled={!!removendoId}
              onClick={() => { if (confirmarRemover) { const m = confirmarRemover; setConfirmarRemover(null); remover(m.id, m.name); } }}>
              Remover
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}

export function GruposClient({ userId, despesas, investimentos }: { userId: string; despesas: GrupoDados; investimentos: GrupoDados }) {
  return (
    <div className="space-y-10 w-full max-w-2xl">
      <GrupoSecao tipo="despesas" dados={despesas} userId={userId} />
      <GrupoSecao tipo="investimentos" dados={investimentos} userId={userId} />
    </div>
  );
}
