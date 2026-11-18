"use client";

import { useEffect, useState } from "react";
import { ExternalLink, Loader2 } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { AtivoInfo } from "@/lib/carteira/ativo-info";

// Popup com a ficha do ativo (clique no ticker da tabela Real x planejado). Fecha por X, Esc ou clique fora (Radix).
// Os dados vêm de /api/carteira/ativo-info (servidor; cache de 24 h). Guardamos o resultado por código na sessão.
const memoria = new Map<string, AtivoInfo>();

export function AtivoInfoDialog({ codigo, onClose }: { codigo: string | null; onClose: () => void }) {
  // Resultado por código: o estado só muda dentro dos callbacks da busca; "carregando" é derivado
  const [res, setRes] = useState<{ codigo: string; info?: AtivoInfo; erro?: string } | null>(null);
  const atual = codigo && res?.codigo === codigo ? res : null;
  const info = codigo ? memoria.get(codigo) ?? atual?.info ?? null : null;
  const erro = atual?.erro ?? null;
  const carregando = !!codigo && !info && !erro;

  useEffect(() => {
    if (!codigo || memoria.has(codigo)) return;
    let cancelado = false;
    fetch(`/api/carteira/ativo-info?codigo=${encodeURIComponent(codigo)}`)
      .then(async (r) => {
        const j = await r.json().catch(() => null);
        if (!r.ok) throw new Error(j?.error ?? "Não foi possível carregar a descrição agora.");
        return j as AtivoInfo;
      })
      .then((j) => { memoria.set(codigo, j); if (!cancelado) setRes({ codigo, info: j }); })
      .catch((e: Error) => { if (!cancelado) setRes({ codigo, erro: e.message }); });
    return () => { cancelado = true; };
  }, [codigo]);

  return (
    <Dialog open={!!codigo} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-lg max-h-[85dvh] overflow-y-auto p-4 sm:p-6">
        <DialogHeader className="pr-6">
          <DialogTitle style={{ fontFamily: "Sora, sans-serif" }}>{codigo}</DialogTitle>
          <DialogDescription>
            {info ? `${info.nome} · ${info.tipoNome}` : "Sobre o ativo"}
          </DialogDescription>
        </DialogHeader>

        {carregando && (
          <p className="flex items-center gap-2 text-sm text-muted-foreground py-6 justify-center">
            <Loader2 className="h-4 w-4 animate-spin" /> Buscando informações…
          </p>
        )}
        {erro && <p className="text-sm text-muted-foreground py-4">{erro}</p>}

        {info && (
          <div className="space-y-3 text-sm">
            {info.descricao ? (
              <div>
                <p className="leading-relaxed text-foreground">{info.descricao}</p>
                {info.idiomaOriginal && (
                  <p className="mt-1 text-xs text-muted-foreground">Descrição no idioma original (inglês), conforme o Yahoo Finance.</p>
                )}
              </div>
            ) : (
              <p className="text-muted-foreground">
                Ainda não temos uma descrição para este ativo. Consulte a gestora ou o site da bolsa pelos links abaixo.
              </p>
            )}

            {info.destaques.length > 0 && (
              <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 rounded-xl bg-secondary/40 p-3">
                {info.destaques.map((d) => (
                  <div key={d.rotulo} className="contents">
                    <dt className="text-xs font-semibold text-muted-foreground">{d.rotulo}</dt>
                    <dd className="text-xs text-foreground break-words">{d.valor}</dd>
                  </div>
                ))}
              </dl>
            )}

            {info.fontes.length > 0 && (
              <p className="text-xs text-muted-foreground">
                Fonte:{" "}
                {info.fontes.map((f, i) => (
                  <span key={f.url}>
                    {i > 0 && " · "}
                    <a href={f.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-0.5 underline underline-offset-2 hover:text-foreground">
                      {f.nome}<ExternalLink className="h-3 w-3" />
                    </a>
                  </span>
                ))}
              </p>
            )}
            <p className="text-[11px] text-muted-foreground">Informação geral, sem recomendação de investimento.</p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
