"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { ACCENT, inputCls } from "@/components/carteira/campos";

// Nome da carteira: aparece no topo da Visão geral. Útil para marcar, por exemplo, a "Carteira teste".
export function NomeCarteira({ nomeAtual, padrao, podeEditar }: { nomeAtual: string | null; padrao: string; podeEditar: boolean }) {
  const router = useRouter();
  const { toast } = useToast();
  const [nome, setNome] = useState(nomeAtual ?? "");
  const [salvando, setSalvando] = useState(false);
  const alterado = nome.trim() !== (nomeAtual ?? "");

  const salvar = async () => {
    setSalvando(true);
    try {
      const res = await fetch("/api/carteira/nome", {
        method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ nome }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? "Erro ao salvar o nome");
      toast({ title: json.nome ? "Nome da carteira salvo" : "Nome padrão restaurado" });
      router.refresh();
    } catch (e) {
      toast({ variant: "destructive", title: "Erro", description: e instanceof Error ? e.message : String(e) });
    } finally {
      setSalvando(false);
    }
  };

  return (
    <section className="rounded-2xl border border-border bg-card p-4 shadow-sm">
      <h2 className="text-base font-bold text-foreground" style={{ fontFamily: "Sora, sans-serif" }}>Nome da carteira</h2>
      <p className="text-xs text-muted-foreground mt-0.5">Aparece no topo da Visão geral. Deixe em branco para voltar a “{padrao}”.</p>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <input className={`${inputCls} max-w-sm`} value={nome} maxLength={60} disabled={!podeEditar || salvando} placeholder={padrao}
          aria-label="Nome da carteira" onChange={(e) => setNome(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && alterado && podeEditar) void salvar(); }} />
        {podeEditar && (
          <button type="button" onClick={salvar} disabled={!alterado || salvando}
            className="px-3 py-2 rounded-lg text-sm font-semibold text-white disabled:opacity-50 inline-flex items-center gap-1.5" style={{ backgroundColor: ACCENT }}>
            {salvando && <Loader2 className="h-3.5 w-3.5 animate-spin" />}Salvar nome
          </button>
        )}
      </div>
    </section>
  );
}
