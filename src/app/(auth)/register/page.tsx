"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Loader2 } from "lucide-react";

export default function RegisterPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", password: "", confirmPassword: "" });

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (form.password !== form.confirmPassword) {
      toast({ variant: "destructive", title: "Senhas não conferem", description: "Verifique e tente novamente." });
      return;
    }

    if (form.password.length < 6) {
      toast({ variant: "destructive", title: "Senha muito curta", description: "A senha deve ter pelo menos 6 caracteres." });
      return;
    }

    setLoading(true);
    const supabase = createClient();

    const { data, error } = await supabase.auth.signUp({
      email: form.email,
      password: form.password,
      options: { data: { name: form.name } },
    });

    if (error) {
      toast({ variant: "destructive", title: "Erro no cadastro", description: error.message });
      setLoading(false);
      return;
    }

    if (data.user) {
      // Create profile and initial group
      await supabase.from("profiles").upsert({
        id: data.user.id,
        name: form.name,
        email: form.email,
      });

      // Create a default group for this user
      const { data: groupData } = await supabase
        .from("groups")
        .insert({ name: `Família de ${form.name.split(" ")[0]}`, created_by: data.user.id })
        .select()
        .single();

      if (groupData) {
        await supabase.from("profiles").update({ group_id: groupData.id }).eq("id", data.user.id);
      }

      toast({ title: "Cadastro realizado!", description: "Bem-vindo ao Despesas Familiares." });
      router.push("/dashboard");
      router.refresh();
    }
  }

  return (
    <div className="animate-fade-in-up">
      <div className="mb-8">
        <h1
          className="text-2xl font-bold text-foreground mb-2"
          style={{ fontFamily: "Sora, sans-serif" }}
        >
          Crie sua conta
        </h1>
        <p className="text-muted-foreground">Comece a controlar as despesas da sua família</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="name">Nome completo</Label>
          <Input
            id="name"
            placeholder="João Silva"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            required
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="email">E-mail</Label>
          <Input
            id="email"
            type="email"
            placeholder="seu@email.com"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            required
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="password">Senha</Label>
          <Input
            id="password"
            type="password"
            placeholder="••••••••"
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
            required
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="confirm">Confirmar senha</Label>
          <Input
            id="confirm"
            type="password"
            placeholder="••••••••"
            value={form.confirmPassword}
            onChange={(e) => setForm({ ...form, confirmPassword: e.target.value })}
            required
          />
        </div>

        <Button type="submit" className="w-full mt-2" size="lg" disabled={loading}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          {loading ? "Criando conta..." : "Criar conta"}
        </Button>
      </form>

      <p className="mt-6 text-center text-sm text-muted-foreground">
        Já tem uma conta?{" "}
        <Link href="/login" className="text-primary font-semibold hover:underline">
          Entrar
        </Link>
      </p>
    </div>
  );
}
