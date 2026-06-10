"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { Profile, Group, Category } from "@/types";
import { formatDate, getInitials } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { UserPlus, Users, Mail, Check, Crown, Loader2, Pencil, Trash2, Plus, X, Tag } from "lucide-react";

interface SettingsClientProps {
  profile: Profile | null;
  group: { id: string; name: string; created_by: string; created_at: string } | null;
  members: Profile[];
  pendingInvites: { id: string; invited_email: string; accepted: boolean; created_at: string }[];
  myInvites: { id: string; group_id: string; groups?: { id: string; name: string } }[];
  currentUserId: string;
  categories: Category[];
  isAdmin: boolean;
}

const USER_COLORS = ["#10b981", "#3b82f6", "#8b5cf6", "#f59e0b", "#ef4444", "#06b6d4"];
const PRESET_COLORS = ["#10b981", "#3b82f6", "#8b5cf6", "#f59e0b", "#ef4444", "#06b6d4", "#6b7280", "#ec4899", "#f97316", "#84cc16"];

export function SettingsClient({ profile, group, members, pendingInvites, myInvites, currentUserId, categories: initialCategories, isAdmin }: SettingsClientProps) {
  const router = useRouter();
  const { toast } = useToast();

  // Profile state
  const [updatingName, setUpdatingName] = useState(false);
  const [name, setName] = useState(profile?.name ?? "");

  // Group creation state
  const [groupName, setGroupName] = useState(group?.name ?? "");
  const [creatingGroup, setCreatingGroup] = useState(false);

  // Invite state
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviting, setInviting] = useState(false);
  const [acceptingId, setAcceptingId] = useState<string | null>(null);

  // Category state
  const [categories, setCategories] = useState<Category[]>(initialCategories);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ label: "", emoji: "", color: "" });
  const [showAddForm, setShowAddForm] = useState(false);
  const [newForm, setNewForm] = useState({ label: "", emoji: "📦", color: "#6b7280" });
  const [savingCategory, setSavingCategory] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

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
      .from("groups")
      .insert({ name: groupName.trim(), created_by: currentUserId })
      .select()
      .single();
    if (error || !newGroup) {
      setCreatingGroup(false);
      toast({ variant: "destructive", title: "Erro", description: error?.message });
      return;
    }
    await supabase.from("profiles").update({ group_id: newGroup.id }).eq("id", currentUserId);
    setCreatingGroup(false);
    toast({ title: "Grupo criado!" });
    router.refresh();
  }

  async function handleInvite() {
    if (!inviteEmail.trim() || !group) return;
    setInviting(true);
    const supabase = createClient();
    const { data: existing } = await supabase
      .from("profiles").select("id").eq("email", inviteEmail.trim()).eq("group_id", group.id).single();
    if (existing) {
      setInviting(false);
      toast({ variant: "destructive", title: "Já é membro", description: "Este usuário já pertence ao grupo." });
      return;
    }
    const { error } = await supabase.from("group_invites").insert({
      group_id: group.id, invited_email: inviteEmail.trim(), invited_by: currentUserId,
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
    await supabase.from("group_invites").update({ accepted: true }).eq("id", inviteId);
    await supabase.from("profiles").update({ group_id: groupId }).eq("id", currentUserId);
    setAcceptingId(null);
    toast({ title: "Convite aceito!", description: "Você entrou no grupo." });
    router.refresh();
  }

  function startEdit(cat: Category) {
    setEditingId(cat.id);
    setEditForm({ label: cat.label, emoji: cat.emoji, color: cat.color });
  }

  function cancelEdit() {
    setEditingId(null);
  }

  async function handleSaveEdit(id: string) {
    if (!editForm.label.trim()) return;
    setSavingCategory(true);
    const supabase = createClient();
    const { error } = await supabase
      .from("group_categories")
      .update({ label: editForm.label.trim(), emoji: editForm.emoji.trim() || "📦", color: editForm.color })
      .eq("id", id);
    setSavingCategory(false);
    if (error) { toast({ variant: "destructive", title: "Erro ao salvar", description: error.message }); return; }
    setCategories((prev) => prev.map((c) => c.id === id ? { ...c, ...editForm, emoji: editForm.emoji.trim() || "📦" } : c));
    setEditingId(null);
    toast({ title: "Categoria atualizada!" });
  }

  async function handleDelete(id: string) {
    setDeletingId(id);
    const supabase = createClient();
    const { error } = await supabase.from("group_categories").delete().eq("id", id);
    setDeletingId(null);
    if (error) { toast({ variant: "destructive", title: "Erro ao excluir", description: error.message }); return; }
    setCategories((prev) => prev.filter((c) => c.id !== id));
    toast({ title: "Categoria excluída!" });
  }

  async function handleAddCategory() {
    if (!newForm.label.trim() || !group) return;
    setSavingCategory(true);
    const supabase = createClient();
    const nextPosition = categories.length;
    const { data, error } = await supabase
      .from("group_categories")
      .insert({
        group_id: group.id,
        label: newForm.label.trim(),
        emoji: newForm.emoji.trim() || "📦",
        color: newForm.color,
        position: nextPosition,
      })
      .select()
      .single();
    setSavingCategory(false);
    if (error || !data) { toast({ variant: "destructive", title: "Erro ao criar", description: error?.message }); return; }
    setCategories((prev) => [...prev, data]);
    setNewForm({ label: "", emoji: "📦", color: "#6b7280" });
    setShowAddForm(false);
    toast({ title: "Categoria criada!" });
  }

  return (
    <div className="space-y-6 max-w-2xl">
      {/* Pending invites for me */}
      {myInvites.length > 0 && (
        <Card className="border-primary/30 bg-primary/5">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Mail className="h-4 w-4 text-primary" />
              Convites pendentes
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {myInvites.map((invite) => (
              <div key={invite.id} className="flex items-center justify-between gap-3 p-3 bg-background rounded-lg border border-border">
                <div>
                  <p className="text-sm font-medium">{invite.groups?.name ?? "Grupo"}</p>
                  <p className="text-xs text-muted-foreground">Você foi convidado para este grupo</p>
                </div>
                <Button size="sm" onClick={() => handleAcceptInvite(invite.id, invite.group_id)} disabled={acceptingId === invite.id} className="gap-1.5">
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
              <AvatarFallback className="text-lg font-semibold bg-primary text-white">
                {name ? getInitials(name) : "?"}
              </AvatarFallback>
            </Avatar>
            <div>
              <p className="font-semibold">{profile?.email}</p>
              <p className="text-sm text-muted-foreground">Membro desde {profile?.created_at ? formatDate(profile.created_at.split("T")[0]) : "-"}</p>
            </div>
          </div>
          <Separator />
          <div className="space-y-2">
            <Label htmlFor="profile-name">Nome</Label>
            <div className="flex gap-2">
              <Input id="profile-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Seu nome" />
              <Button onClick={handleUpdateName} disabled={updatingName || name === profile?.name} variant="outline">
                {updatingName ? <Loader2 className="h-4 w-4 animate-spin" /> : "Salvar"}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Group */}
      {group ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Users className="h-4 w-4" />
              {group.name}
            </CardTitle>
            <CardDescription>{members.length} membro{members.length !== 1 ? "s" : ""}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="space-y-2">
              {members.map((m, i) => (
                <div key={m.id} className="flex items-center gap-3 p-2.5 rounded-lg hover:bg-secondary/50">
                  <Avatar className="h-8 w-8">
                    <AvatarFallback className="text-xs font-semibold text-white" style={{ backgroundColor: USER_COLORS[i % USER_COLORS.length] }}>
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
                  {m.id === group.created_by && (
                    <Badge variant="secondary" className="text-xs gap-1">
                      <Crown className="h-3 w-3" /> Admin
                    </Badge>
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

            <Separator />

            <div className="space-y-2">
              <Label>Convidar novo membro</Label>
              <div className="flex gap-2">
                <Input
                  type="email"
                  placeholder="email@exemplo.com"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleInvite()}
                />
                <Button onClick={handleInvite} disabled={inviting || !inviteEmail.trim()} className="gap-1.5 flex-shrink-0">
                  {inviting ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
                  Convidar
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">O usuário precisa estar cadastrado no app para aceitar o convite.</p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Criar grupo familiar</CardTitle>
            <CardDescription>Crie um grupo para compartilhar despesas com sua família</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="group-name">Nome do grupo</Label>
              <div className="flex gap-2">
                <Input id="group-name" placeholder="Ex: Família Silva" value={groupName} onChange={(e) => setGroupName(e.target.value)} />
                <Button onClick={handleCreateGroup} disabled={creatingGroup || !groupName.trim()}>
                  {creatingGroup ? <Loader2 className="h-4 w-4 animate-spin" /> : "Criar"}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Category management — admin only */}
      {group && isAdmin && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-base flex items-center gap-2">
                  <Tag className="h-4 w-4" />
                  Categorias
                </CardTitle>
                <CardDescription>Gerencie as categorias de despesas do grupo</CardDescription>
              </div>
              {!showAddForm && (
                <Button size="sm" variant="outline" onClick={() => setShowAddForm(true)} className="gap-1.5">
                  <Plus className="h-3.5 w-3.5" />
                  Nova
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent className="space-y-2">
            {categories.length === 0 && !showAddForm && (
              <p className="text-sm text-muted-foreground text-center py-4">Nenhuma categoria cadastrada.</p>
            )}

            {categories.map((cat) => (
              <div key={cat.id}>
                {editingId === cat.id ? (
                  /* Inline edit form */
                  <div className="border border-primary/30 rounded-lg p-3 space-y-3 bg-secondary/20">
                    <div className="grid grid-cols-[1fr_80px_44px] gap-2">
                      <div className="space-y-1">
                        <Label className="text-xs">Nome</Label>
                        <Input
                          value={editForm.label}
                          onChange={(e) => setEditForm({ ...editForm, label: e.target.value })}
                          placeholder="Ex: Moradia"
                          className="h-8 text-sm"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Emoji</Label>
                        <Input
                          value={editForm.emoji}
                          onChange={(e) => setEditForm({ ...editForm, emoji: e.target.value })}
                          placeholder="🏠"
                          className="h-8 text-sm text-center"
                          maxLength={4}
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Cor</Label>
                        <input
                          type="color"
                          value={editForm.color}
                          onChange={(e) => setEditForm({ ...editForm, color: e.target.value })}
                          className="h-8 w-full rounded-md border border-input cursor-pointer"
                        />
                      </div>
                    </div>
                    <div className="flex gap-1.5 flex-wrap">
                      {PRESET_COLORS.map((c) => (
                        <button
                          key={c}
                          type="button"
                          onClick={() => setEditForm({ ...editForm, color: c })}
                          className="h-5 w-5 rounded-full border-2 transition-all"
                          style={{ backgroundColor: c, borderColor: editForm.color === c ? "#000" : "transparent" }}
                        />
                      ))}
                    </div>
                    <div className="flex gap-2 justify-end">
                      <Button size="sm" variant="ghost" onClick={cancelEdit}>Cancelar</Button>
                      <Button size="sm" onClick={() => handleSaveEdit(cat.id)} disabled={savingCategory || !editForm.label.trim()}>
                        {savingCategory ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Salvar"}
                      </Button>
                    </div>
                  </div>
                ) : (
                  /* Category row */
                  <div className="flex items-center gap-3 p-2.5 rounded-lg hover:bg-secondary/40 group">
                    <div className="h-7 w-7 rounded-full flex items-center justify-center text-sm flex-shrink-0" style={{ backgroundColor: cat.color + "25" }}>
                      <span>{cat.emoji}</span>
                    </div>
                    <div className="h-2.5 w-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: cat.color }} />
                    <span className="text-sm font-medium flex-1">{cat.label}</span>
                    <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-primary" onClick={() => startEdit(cat)}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-muted-foreground hover:text-destructive"
                        onClick={() => handleDelete(cat.id)}
                        disabled={deletingId === cat.id}
                      >
                        {deletingId === cat.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            ))}

            {/* Add new category form */}
            {showAddForm && (
              <>
                {categories.length > 0 && <Separator />}
                <div className="border border-primary/30 rounded-lg p-3 space-y-3 bg-secondary/20">
                  <p className="text-sm font-medium">Nova categoria</p>
                  <div className="grid grid-cols-[1fr_80px_44px] gap-2">
                    <div className="space-y-1">
                      <Label className="text-xs">Nome</Label>
                      <Input
                        value={newForm.label}
                        onChange={(e) => setNewForm({ ...newForm, label: e.target.value })}
                        placeholder="Ex: Pets"
                        className="h-8 text-sm"
                        autoFocus
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Emoji</Label>
                      <Input
                        value={newForm.emoji}
                        onChange={(e) => setNewForm({ ...newForm, emoji: e.target.value })}
                        placeholder="🐶"
                        className="h-8 text-sm text-center"
                        maxLength={4}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Cor</Label>
                      <input
                        type="color"
                        value={newForm.color}
                        onChange={(e) => setNewForm({ ...newForm, color: e.target.value })}
                        className="h-8 w-full rounded-md border border-input cursor-pointer"
                      />
                    </div>
                  </div>
                  <div className="flex gap-1.5 flex-wrap">
                    {PRESET_COLORS.map((c) => (
                      <button
                        key={c}
                        type="button"
                        onClick={() => setNewForm({ ...newForm, color: c })}
                        className="h-5 w-5 rounded-full border-2 transition-all"
                        style={{ backgroundColor: c, borderColor: newForm.color === c ? "#000" : "transparent" }}
                      />
                    ))}
                  </div>
                  <div className="flex gap-2 justify-end">
                    <Button size="sm" variant="ghost" onClick={() => { setShowAddForm(false); setNewForm({ label: "", emoji: "📦", color: "#6b7280" }); }}>
                      <X className="h-3.5 w-3.5 mr-1" />
                      Cancelar
                    </Button>
                    <Button size="sm" onClick={handleAddCategory} disabled={savingCategory || !newForm.label.trim()}>
                      {savingCategory ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5 mr-1" />}
                      Adicionar
                    </Button>
                  </div>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
