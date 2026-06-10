"use client";

import { useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Mail, Eye, EyeOff } from "lucide-react";

export default function RegisterPage() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [emailSent, setEmailSent] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", password: "", confirmPassword: "" });

  async function handleSubmit(e: { preventDefault(): void }) {
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

    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://app-despesas-familiares.vercel.app";

    const { error } = await supabase.auth.signUp({
      email: form.email,
      password: form.password,
      options: {
        data: { name: form.name },
        emailRedirectTo: `${siteUrl}/login`,
      },
    });

    setLoading(false);

    if (error) {
      toast({ variant: "destructive", title: "Erro no cadastro", description: error.message });
      return;
    }

    setEmailSent(form.email);
  }

  if (emailSent) {
    return (
      <div className="animate-fade-in-up text-center">
        <div className="flex justify-center mb-6">
          <div className="bg-primary/10 rounded-full p-5">
            <Mail className="h-10 w-10 text-primary" />
          </div>
        </div>
        <h1
          className="text-2xl font-bold text-foreground mb-3"
          style={{ fontFamily: "Sora, sans-serif" }}
        >
          Confirme seu e-mail
        </h1>
        <p className="text-muted-foreground mb-2">
          Enviamos um link de confirmação para:
        </p>
        <p className="font-semibold text-foreground mb-6">{emailSent}</p>
        <p className="text-sm text-muted-foreground mb-8">
          Acesse sua caixa de entrada, clique no link de confirmação e depois faça login para começar a usar o app.
        </p>
        <Link href="/login">
          <Button className="w-full" size="lg">Ir para o login</Button>
        </Link>
        <p className="mt-4 text-xs text-muted-foreground">
          Não recebeu o e-mail? Verifique a pasta de spam.
        </p>
      </div>
    );
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
          <div className="relative">
            <Input
              id="password"
              type={showPassword ? "text" : "password"}
              placeholder="••••••••"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              required
              className="pr-10"
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
              tabIndex={-1}
              aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
            >
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="confirm">Confirmar senha</Label>
          <div className="relative">
            <Input
              id="confirm"
              type={showConfirm ? "text" : "password"}
              placeholder="••••••••"
              value={form.confirmPassword}
              onChange={(e) => setForm({ ...form, confirmPassword: e.target.value })}
              required
              className="pr-10"
            />
            <button
              type="button"
              onClick={() => setShowConfirm((v) => !v)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
              tabIndex={-1}
              aria-label={showConfirm ? "Ocultar confirmação" : "Mostrar confirmação"}
            >
              {showConfirm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
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
