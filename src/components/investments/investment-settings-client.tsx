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
import { UserPlus, Users, Mail, Check, Crown, Loader2, Trash2 } from "lucide-react";

const ACCENT = "#3b82f6";
const USER_COLORS = [ACCENT, "#10b981", "#8b5cf6", "#f59e0b", "#ef4444", "#06b6d4"];

interface InvestmentSettingsClientProps {
  profile: Profile | null;
  group: InvestmentGroup | null;
  members: Profile[];
  pendingInvites: { id: string; invited_email: string; accepted: boolean; created_at: string }[];
  myInvites: { id: string; group_id: string; investment_groups?: { id: string; name: string } }[];
  currentUserId: string;
  isAdmin: boolean;
}

export function InvestmentSettingsClient({
  profile,
  group,
  members,
  pendingInvites,
  myInvites,
  currentUserId,
  isAdmin,
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
    const { data: newGroup, error } = await supabase
      .from("investment_groups")
      .insert({ name: groupName.trim(), created_by: currentUserId })
      .select()
      .single();
    if (error || !newGroup) {
      setCreatingGroup(false);
      toast({ variant: "destructive", title: "Erro", description: error?.message });
      return;
    }
    await supabase.from("profiles").update({ investment_group_id: newGroup.id }).eq("id", currentUserId);
    setCreatingGroup(false);
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
