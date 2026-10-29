"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { Profile, Category } from "@/types";
import { formatDate, getInitials } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Pencil, Trash2, Plus, X, Tag } from "lucide-react";

interface SettingsClientProps {
  profile: Profile | null;
  group: { id: string; name: string; created_by: string; created_at: string } | null;
  currentUserId: string;
  categories: Category[];
  isAdmin: boolean;
}

const PRESET_COLORS = ["#10b981", "#3b82f6", "#8b5cf6", "#f59e0b", "#ef4444", "#06b6d4", "#6b7280", "#ec4899", "#f97316", "#84cc16"];
const PRESET_EMOJIS = ["🏠","🍽️","🚗","💊","📚","👕","🎉","💆","🐾","🛒","💼","✈️","🎮","📱","💰","🏋️","🎁","🌿","🔧","⚡","🌊","🐶","🍺","☕","🎵","🎓","🧴","🏥","🌎","💻"];

export function SettingsClient({ profile, group, currentUserId, categories: initialCategories, isAdmin }: SettingsClientProps) {
  const router = useRouter();
  const { toast } = useToast();

  // Profile state
  const [updatingName, setUpdatingName] = useState(false);
  const [name, setName] = useState(profile?.name ?? "");

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
    <div className="space-y-6 w-full max-w-2xl">
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
              <p className="text-sm text-muted-foreground">Grupo: {group?.name ?? "sem grupo"}</p>
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
                    <div className="grid grid-cols-2 sm:grid-cols-[1fr_80px_44px] gap-2">
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
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">Emojis sugeridos</Label>
                      <div className="flex gap-1 flex-wrap">
                        {PRESET_EMOJIS.map((e) => (
                          <button
                            key={e}
                            type="button"
                            onClick={() => setEditForm((f) => ({ ...f, emoji: e }))}
                            className={`h-7 w-7 rounded text-base flex items-center justify-center transition-all border ${editForm.emoji === e ? "border-primary bg-primary/10" : "border-transparent hover:bg-secondary"}`}
                          >
                            {e}
                          </button>
                        ))}
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
                    <div className="flex gap-1 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
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
                  <div className="grid grid-cols-2 sm:grid-cols-[1fr_80px_44px] gap-2">
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
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Emojis sugeridos</Label>
                    <div className="flex gap-1 flex-wrap">
                      {PRESET_EMOJIS.map((e) => (
                        <button
                          key={e}
                          type="button"
                          onClick={() => setNewForm((f) => ({ ...f, emoji: e }))}
                          className={`h-7 w-7 rounded text-base flex items-center justify-center transition-all border ${newForm.emoji === e ? "border-primary bg-primary/10" : "border-transparent hover:bg-secondary"}`}
                        >
                          {e}
                        </button>
                      ))}
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
