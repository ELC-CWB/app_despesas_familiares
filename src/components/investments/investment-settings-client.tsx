"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { Profile, InvestmentGroup } from "@/types";
import { formatDate, getInitials } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { UserPlus, Users, Mail, Check, Crown, Loader2, Trash2, LogOut, ShieldCheck } from "lucide-react";
import { Switch } from "@/components/ui/switch";

const ACCENT = "#3b82f6";
const USER_COLORS = [ACCENT, "#10b981", "#8b5cf6", "#f59e0b", "#ef4444", "#06b6d4"];

interface AllProfile {
  id: string;
  name: string;
  email: string;
  avatar_url: string | null;
  has_investments_access: boolean;
}

interface InvestmentSettingsClientProps {
  profile: Profile | null;
  group: InvestmentGroup | null;
  members: Profile[];
  pendingInvites: { id: string; invited_email: string; accepted: boolean; created_at: string }[];
  myInvites: { id: string; group_id: string; investment_groups?: { id: string; name: string } }[];
  currentUserId: string;
  isAdmin: boolean;
  allProfiles?: AllProfile[];
}

export function InvestmentSettingsClient({
  profile,
  group,
  members,
  pendingInvites,
  myInvites,
  currentUserId,
  isAdmin,
  allProfiles = [],
}: InvestmentSettingsClientProps) {
  const router = useRouter();
  const { toast } = useToast();

  const [updatingName, setUpdatingName] = useState(false);
  const [name, setName] = useState(profile?.name ?? "");

  const [groupName, setGroupName] = useState(group?.name ?? "");
  const [creatingGroup, setCreatingGroup] = useState(false);

  const [inviteEmail, setInviteEmail] = useState("");
  const [inviting, setInviting] = useState(false);
  const [acceptingId, setAcceptingId] = useState<string | null>(null);
  const [removingMemberId, setRemovingMemberId] = useState<string | null>(null);
  const [confirmRemove, setConfirmRemove] = useState<{ id: string; name: string } | null>(null);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [leavingGroup, setLeavingGroup] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deletingGroup, setDeletingGroup] = useState(false);
  const [accessProfiles, setAccessProfiles] = useState<AllProfile[]>(allProfiles);
  const [togglingAccess, setTogglingAccess] = useState<string | null>(null);

  async function handleUpdateName() {
    setUpdatingName(true);
    const supabase = createClient();
    const { error } = await supabase.from("profiles").update({ name }).eq("id", currentUserId);
    setUpdatingName(false);
    if (error) { toast({ variant: "destructive", title: "Erro ao atualizar", description: error.message }); return; }
    toast({ title: "Nome atualizado!" });
    router.refresh();
  }

  async function handleCreateGroup() {
    if (!groupName.trim()) return;
    setCreatingGroup(true);
    const supabase = createClient();
    const { error } = await supabase.rpc("create_investment_group", {
      group_name: groupName.trim(),
    });
    setCreatingGroup(false);
    if (error) {
      toast({ variant: "destructive", title: "Erro", description: error.message });
      return;
    }
    toast({ title: "Grupo criado!" });
    router.refresh();
  }

  async function handleInvite() {
    if (!inviteEmail.trim() || !group) return;
    setInviting(true);
    const supabase = createClient();
    const { data: existing } = await supabase
      .from("profiles").select("id").eq("email", inviteEmail.trim()).eq("investment_group_id", group.id).single();
    if (existing) {
      setInviting(false);
      toast({ variant: "destructive", title: "Já é membro", description: "Este usuário já pertence ao grupo." });
      return;
    }
    const { error } = await supabase.from("investment_group_invites").insert({
      group_id: group.id,
      invited_email: inviteEmail.trim(),
      invited_by: currentUserId,
    });
    setInviting(false);
    if (error) { toast({ variant: "destructive", title: "Erro ao convidar", description: error.message }); return; }
    toast({ title: "Convite enviado!", description: `Convite enviado para ${inviteEmail}.` });
    setInviteEmail("");
    router.refresh();
  }

  async function handleAcceptInvite(inviteId: string, groupId: string) {
    setAcceptingId(inviteId);
    const supabase = createClient();
    await supabase.from("investment_group_invites").update({ accepted: true }).eq("id", inviteId);
    await supabase.from("profiles").update({ investment_group_id: groupId }).eq("id", currentUserId);
    setAcceptingId(null);
    toast({ title: "Convite aceito!", description: "Você entrou no grupo de investimentos." });
    router.refresh();
  }

  async function handleLeaveGroup() {
    setLeavingGroup(true);
    const supabase = createClient();
    const { error } = await supabase
      .from("profiles")
      .update({ investment_group_id: null })
      .eq("id", currentUserId);
    setLeavingGroup(false);
    if (error) {
      toast({ variant: "destructive", title: "Erro ao sair do grupo", description: error.message });
      return;
    }
    toast({ title: "Você saiu do grupo de investimentos." });
    router.refresh();
  }

  async function handleDeleteGroup() {
    if (!group) return;
    setDeletingGroup(true);
    const supabase = createClient();
    const { error } = await supabase.rpc("delete_investment_group", { grp_id: group.id });
    setDeletingGroup(false);
    if (error) {
      toast({ variant: "destructive", title: "Erro ao excluir grupo", description: error.message });
      return;
    }
    toast({ title: "Grupo excluído.", description: "Todos os membros foram removidos." });
    router.refresh();
  }

  async function handleToggleAccess(targetId: string, currentAccess: boolean) {
    setTogglingAccess(targetId);
    const supabase = createClient();
    const { error } = await supabase.rpc("set_investment_access", {
      target_user_id: targetId,
      has_access: !currentAccess,
    });
    setTogglingAccess(null);
    if (error) {
      toast({ variant: "destructive", title: "Erro ao alterar acesso", description: error.message });
      return;
    }
    setAccessProfiles((prev) =>
      prev.map((p) => p.id === targetId ? { ...p, has_investments_access: !currentAccess } : p)
    );
    toast({ title: !currentAccess ? "Acesso liberado" : "Acesso revogado" });
  }

  async function handleRemoveMember(memberId: string, memberName: string) {
    if (!group) return;
    setRemovingMemberId(memberId);
    const supabase = createClient();
    const { error } = await supabase.rpc("remove_investment_group_member", {
      member_id: memberId,
      grp_id: group.id,
    });
    setRemovingMemberId(null);
    if (error) { toast({ variant: "destructive", title: "Erro ao remover membro", description: error.message }); return; }
    toast({ title: "Membro removido", description: `${memberName} foi removido do grupo.` });
    router.refresh();
  }

  return (
    <div className="space-y-6 w-full max-w-2xl">
      {/* Pending investment group invites for me */}
      {myInvites.length > 0 && (
        <Card style={{ borderColor: `${ACCENT}4d`, backgroundColor: `${ACCENT}0d` }}>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Mail className="h-4 w-4" style={{ color: ACCENT }} />
              Convites pendentes
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {myInvites.map((invite) => (
              <div key={invite.id} className="flex items-center justify-between gap-3 p-3 bg-background rounded-lg border border-border">
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{invite.investment_groups?.name ?? "Grupo"}</p>
                  <p className="text-xs text-muted-foreground">Você foi convidado para este grupo de investimentos</p>
                </div>
                <Button
                  size="sm"
                  onClick={() => handleAcceptInvite(invite.id, invite.group_id)}
                  disabled={acceptingId === invite.id}
                  className="gap-1.5 flex-shrink-0 text-white"
                  style={{ backgroundColor: ACCENT }}
                >
                  {acceptingId === invite.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                  Aceitar
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Profile */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Perfil</CardTitle>
          <CardDescription>Suas informações pessoais</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-4">
            <Avatar className="h-14 w-14">
              <AvatarFallback className="text-lg font-semibold text-white" style={{ backgroundColor: ACCENT }}>
                {name ? getInitials(name) : "?"}
              </AvatarFallback>
            </Avatar>
            <div>
              <p className="font-semibold">{profile?.email}</p>
              <p className="text-sm text-muted-foreground">
                Membro desde {profile?.created_at ? formatDate(profile.created_at.split("T")[0]) : "-"}
              </p>
            </div>
          </div>
          <Separator />
          <div className="space-y-2">
            <Label htmlFor="profile-name">Nome</Label>
            <div className="flex gap-2">
              <Input id="profile-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Seu nome" />
              <Button
                onClick={handleUpdateName}
                disabled={updatingName || name === profile?.name}
                variant="outline"
              >
                {updatingName ? <Loader2 className="h-4 w-4 animate-spin" /> : "Salvar"}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Investment Group */}
      {group ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Users className="h-4 w-4" style={{ color: ACCENT }} />
              {group.name}
            </CardTitle>
            <CardDescription>{members.length} membro{members.length !== 1 ? "s" : ""}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="space-y-2">
              {members.map((m, i) => (
                <div key={m.id} className="flex items-center gap-3 p-2.5 rounded-lg hover:bg-secondary/50">
                  <Avatar className="h-8 w-8">
                    <AvatarFallback
                      className="text-xs font-semibold text-white"
                      style={{ backgroundColor: USER_COLORS[i % USER_COLORS.length] }}
                    >
                      {getInitials(m.name)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">
                      {m.name}
                      {m.id === currentUserId && <span className="text-muted-foreground ml-1">(eu)</span>}
                    </p>
                    <p className="text-xs text-muted-foreground truncate">{m.email}</p>
                  </div>
                  {m.id === group.created_by ? (
                    <Badge variant="secondary" className="text-xs gap-1 flex-shrink-0">
                      <Crown className="h-3 w-3" /> Admin
                    </Badge>
                  ) : isAdmin && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-muted-foreground hover:text-destructive flex-shrink-0"
                      onClick={() => setConfirmRemove({ id: m.id, name: m.name })}
                      disabled={removingMemberId === m.id}
                    >
                      {removingMemberId === m.id
                        ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        : <Trash2 className="h-3.5 w-3.5" />}
                    </Button>
                  )}
                </div>
              ))}
            </div>

            {pendingInvites.length > 0 && (
              <>
                <Separator />
                <div>
                  <p className="text-sm font-medium text-muted-foreground mb-2">Convites pendentes</p>
                  <div className="space-y-1.5">
                    {pendingInvites.map((inv) => (
                      <div key={inv.id} className="flex items-center gap-2 text-sm text-muted-foreground px-2">
                        <Mail className="h-3.5 w-3.5" />
                        <span>{inv.invited_email}</span>
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
                  <Label>Convidar novo membro</Label>
                  <div className="flex flex-col sm:flex-row gap-2">
                    <Input
                      type="email"
                      placeholder="email@exemplo.com"
                      value={inviteEmail}
                      onChange={(e) => setInviteEmail(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && handleInvite()}
                      className="min-w-0"
                    />
                    <Button
                      onClick={handleInvite}
                      disabled={inviting || !inviteEmail.trim()}
                      className="gap-1.5 sm:flex-shrink-0 text-white"
                      style={{ backgroundColor: ACCENT }}
                    >
                      {inviting ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
                      Convidar
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    O usuário precisa estar cadastrado no app para aceitar o convite.
                  </p>
                </div>
              </>
            )}

            {!isAdmin && (
              <>
                <Separator />
                <Button
                  variant="outline"
                  className="gap-2 text-destructive border-destructive/40 hover:bg-destructive/10 hover:text-destructive"
                  onClick={() => setConfirmLeave(true)}
                  disabled={leavingGroup}
                >
                  <LogOut className="h-4 w-4" />
                  Sair do grupo
                </Button>
              </>
            )}

            {isAdmin && (
              <>
                <Separator />
                <Button
                  variant="outline"
                  className="gap-2 text-destructive border-destructive/40 hover:bg-destructive/10 hover:text-destructive"
                  onClick={() => setConfirmDelete(true)}
                  disabled={deletingGroup}
                >
                  <Trash2 className="h-4 w-4" />
                  Excluir grupo
                </Button>
              </>
            )}
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Criar grupo de investimentos</CardTitle>
            <CardDescription>Crie um grupo para compartilhar investimentos com sua família</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="group-name">Nome do grupo</Label>
              <div className="flex flex-col sm:flex-row gap-2">
                <Input
                  id="group-name"
                  placeholder="Ex: Família Silva"
                  value={groupName}
                  onChange={(e) => setGroupName(e.target.value)}
                  className="min-w-0"
                />
                <Button
                  onClick={handleCreateGroup}
                  disabled={creatingGroup || !groupName.trim()}
                  className="sm:flex-shrink-0 text-white"
                  style={{ backgroundColor: ACCENT }}
                >
                  {creatingGroup ? <Loader2 className="h-4 w-4 animate-spin" /> : "Criar"}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Access Management (admin only) */}
      {isAdmin && accessProfiles.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <ShieldCheck className="h-4 w-4" style={{ color: ACCENT }} />
              Gerenciar Acessos
            </CardTitle>
            <CardDescription>
              Defina quais usuários podem acessar a área de investimentos e metas
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {accessProfiles.map((p, i) => (
              <div key={p.id} className="flex items-center gap-3 p-2.5 rounded-lg hover:bg-secondary/50">
                <Avatar className="h-8 w-8 flex-shrink-0">
                  <AvatarFallback
                    className="text-xs font-semibold text-white"
                    style={{ backgroundColor: USER_COLORS[i % USER_COLORS.length] }}
                  >
                    {getInitials(p.name)}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">
                    {p.name}
                    {p.id === currentUserId && <span className="text-muted-foreground ml-1">(eu)</span>}
                  </p>
                  <p className="text-xs text-muted-foreground truncate">{p.email}</p>
                </div>
                {p.id === currentUserId ? (
                  <Badge variant="secondary" className="text-xs gap-1 flex-shrink-0">
                    <Crown className="h-3 w-3" /> Admin
                  </Badge>
                ) : (
                  <Switch
                    checked={p.has_investments_access}
                    disabled={togglingAccess === p.id}
                    onCheckedChange={() => handleToggleAccess(p.id, p.has_investments_access)}
                    aria-label={`Acesso de ${p.name}`}
                  />
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <Dialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Excluir grupo?</DialogTitle>
            <DialogDescription>
              Todos os membros serão removidos do grupo <strong>{group?.name}</strong> e perderão acesso à carteira compartilhada. Esta ação não pode ser desfeita.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setConfirmDelete(false)}>Cancelar</Button>
            <Button
              variant="destructive"
              disabled={deletingGroup}
              onClick={() => { setConfirmDelete(false); handleDeleteGroup(); }}
            >
              {deletingGroup ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Excluir grupo
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={confirmLeave} onOpenChange={setConfirmLeave}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Sair do grupo?</DialogTitle>
            <DialogDescription>
              Você deixará de ter acesso à carteira compartilhada do grupo. Poderá ser convidado novamente pelo administrador.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setConfirmLeave(false)}>Cancelar</Button>
            <Button
              variant="destructive"
              disabled={leavingGroup}
              onClick={() => { setConfirmLeave(false); handleLeaveGroup(); }}
            >
              {leavingGroup ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Sair do grupo
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!confirmRemove} onOpenChange={(o) => { if (!o) setConfirmRemove(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Remover membro?</DialogTitle>
            <DialogDescription>
              Tem certeza que deseja remover <strong>{confirmRemove?.name}</strong> do grupo de investimentos?
              Esta ação não pode ser desfeita.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setConfirmRemove(null)}>Cancelar</Button>
            <Button
              variant="destructive"
              disabled={!!removingMemberId}
              onClick={() => {
                if (confirmRemove) {
                  setConfirmRemove(null);
                  handleRemoveMember(confirmRemove.id, confirmRemove.name);
                }
              }}
            >
              {removingMemberId ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Remover
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
