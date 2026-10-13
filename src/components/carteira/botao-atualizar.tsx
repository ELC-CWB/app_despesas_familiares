"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, RefreshCw } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

// Botão Atualizar da Visão geral (SPEC §4.2): busca as cotações de agora e recarrega a tela.
export function BotaoAtualizar() {
  const router = useRouter();
  const { toast } = useToast();
  const [carregando, setCarregando] = useState(false);

  const atualizar = async () => {
    setCarregando(true);
    try {
      const res = await fetch("/api/carteira/cotacoes", { method: "POST" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? "Erro ao atualizar as cotações");
      if (json.falhas?.length) {
        toast({ variant: "destructive", title: "Algumas cotações não vieram", description: `Sem resposta da fonte: ${json.falhas.join(", ")}` });
      }
      router.refresh();
    } catch (e) {
      toast({ variant: "destructive", title: "Erro ao atualizar", description: e instanceof Error ? e.message : String(e) });
    } finally {
      setCarregando(false);
    }
  };

  return (
    <button type="button" onClick={atualizar} disabled={carregando}
      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold border border-border text-muted-foreground hover:text-foreground hover:bg-secondary/50 transition-colors disabled:opacity-60">
      {carregando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
      Atualizar
    </button>
  );
}
