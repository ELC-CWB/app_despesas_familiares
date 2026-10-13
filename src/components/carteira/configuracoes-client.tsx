"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import {
  ALIQUOTA_EXTERIOR, ALIQUOTAS_PADRAO, CORRETORA_PADRAO, TIPOS_ATIVO, type ChaveAliquota,
} from "@/lib/carteira/constantes";
import { novoId } from "@/lib/carteira/ids";
import type { Estrutura } from "@/lib/carteira/tipos";
import { validarEstrutura } from "@/lib/carteira/validacao";
import { ACCENT, BotaoAdicionar, Campo, DecimalInput, inputCls, Secao } from "@/components/carteira/campos";
import { AtivosEditor, BlocosEditor, CorretoraEditor, GeografiasEditor } from "@/components/carteira/editores";

// Configurações da carteira (docs/carteira/SPEC.md §4.5). Tudo é salvo de uma vez.
export function ConfiguracoesClient({
  estruturaInicial, isReadOnly, ownerName,
}: {
  estruturaInicial: Estrutura;
  isReadOnly: boolean;
  ownerName: string | null;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [e, setE] = useState<Estrutura>(estruturaInicial);
  const [base, setBase] = useState(() => JSON.stringify(estruturaInicial));
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");

  const alterado = JSON.stringify(e) !== base;
  const set = <K extends keyof Estrutura>(k: K, v: Estrutura[K]) => { setErro(""); setE((x) => ({ ...x, [k]: v })); };

  const salvar = async () => {
    const msg = validarEstrutura(e);
    if (msg) { setErro(msg); return; }
    setSalvando(true);
    setErro("");
    try {
      const res = await fetch("/api/carteira/estrutura", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(e),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? "Erro ao salvar");
      setBase(JSON.stringify(e));
      toast({ title: "Configurações salvas" });
      router.refresh();
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Erro ao salvar");
    } finally {
      setSalvando(false);
    }
  };

  // Impostos: só os tipos usados na carteira (+ exterior, se houver ativo no exterior)
  const chavesImposto = useMemo(() => {
    const usados: Partial<Record<ChaveAliquota, string[]>> = {};
    for (const a of e.ativos) {
      const k: ChaveAliquota = a.mercado === "exterior" ? "exterior" : a.tipo;
      (usados[k] ??= []).push(a.codigo || "—");
    }
    const defs = [
      ...TIPOS_ATIVO.map((t) => ({ k: t.id as ChaveAliquota, nome: `${t.nome} (Brasil)`, nota: t.nota })),
      { k: ALIQUOTA_EXTERIOR.id as ChaveAliquota, nome: ALIQUOTA_EXTERIOR.nome, nota: ALIQUOTA_EXTERIOR.nota },
    ];
    return defs.filter((d) => usados[d.k]).map((d) => ({ ...d, usados: usados[d.k]!.join(", ") }));
  }, [e.ativos]);

  const aliquota = (k: ChaveAliquota) => e.config.aliquotas[k] ?? ALIQUOTAS_PADRAO[k];
  const colchao = e.ativos.find((a) => a.id === e.config.colchao_ativo_id);

  return (
    <div className="space-y-4 pb-24">
      {isReadOnly && (
        <div className="flex items-center gap-2 px-4 py-2.5 rounded-xl border text-sm font-medium"
          style={{ borderColor: `${ACCENT}4d`, backgroundColor: `${ACCENT}0d`, color: ACCENT }}>
          <span className="text-base">👁</span>
          Você está vendo a carteira de <strong>{ownerName ?? "outro membro"}</strong>, somente leitura
        </div>
      )}

      <fieldset disabled={isReadOnly} className="space-y-4 min-w-0">
        <Secao titulo="Corretoras" recolhivel abertaInicial={estruturaInicial.corretoras.length === 0}
          descricao="Os campos de câmbio aparecem para corretoras que operam no exterior."
          acao={!isReadOnly && (
            <BotaoAdicionar onClick={() => set("corretoras", [...e.corretoras,
              { id: novoId(), nome: "", mercado: "brasil", ...CORRETORA_PADRAO, spread_pct: 1.0 }])}>
              + Adicionar corretora
            </BotaoAdicionar>
          )}>
          <div className="space-y-3">
            {e.corretoras.length === 0 && (
              <p className="text-sm text-muted-foreground">Nenhuma corretora cadastrada.</p>
            )}
            {e.corretoras.map((c) => {
              const nomes = e.ativos.filter((a) => a.corretora_id === c.id).map((a) => a.codigo);
              return (
                <CorretoraEditor key={c.id} corretora={c} disabled={isReadOnly}
                  ativosTxt={nomes.length ? `Ativos nesta corretora: ${nomes.join(", ")}` : "Nenhum ativo vinculado"}
                  onChange={(nova) => set("corretoras", e.corretoras.map((x) => (x.id === c.id ? nova : x)))}
                  onRemover={() => {
                    const resto = e.corretoras.filter((x) => x.id !== c.id);
                    setErro("");
                    setE((x) => ({
                      ...x,
                      corretoras: resto,
                      ativos: x.ativos.map((a) => (a.corretora_id === c.id ? { ...a, corretora_id: resto[0]?.id ?? null } : a)),
                    }));
                  }} />
              );
            })}
          </div>
        </Secao>

        <Secao titulo="Geografias e blocos" recolhivel abertaInicial={estruturaInicial.blocos.length === 0}
          descricao="A estrutura do gráfico da tela inicial: cada geografia agrupa blocos, e cada bloco agrupa ativos. A cor é escolhida na geografia; blocos e ativos recebem tons dela automaticamente.">
          <div className="space-y-5">
            <GeografiasEditor geografias={e.geografias} blocos={e.blocos} ativos={e.ativos} disabled={isReadOnly}
              onChange={(g) => set("geografias", g)} />
            <BlocosEditor blocos={e.blocos} geografias={e.geografias} ativos={e.ativos} disabled={isReadOnly}
              onChange={(b) => set("blocos", b)} />
          </div>
        </Secao>

        <Secao titulo="Ativos" descricao="Tipo define impostos e custos; bloco define o lugar no gráfico e nas bandas.">
          <AtivosEditor ativos={e.ativos} blocos={e.blocos} corretoras={e.corretoras} disabled={isReadOnly}
            onChange={(a) => {
              const ids = new Set(a.map((x) => x.id));
              setErro("");
              setE((x) => ({
                ...x,
                ativos: a,
                config: ids.has(x.config.colchao_ativo_id ?? "") ? x.config : { ...x.config, colchao_ativo_id: null },
              }));
            }} />

          <div className="mt-5 rounded-xl border border-border p-3 sm:p-4 space-y-3">
            <div>
              <h3 className="text-sm font-bold text-foreground">Colchão de liquidez</h3>
              <p className="text-xs text-muted-foreground">De onde sai o saque quando nenhum ativo está acima do alvo.</p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Campo label="Ativo usado como colchão">
                <select className={inputCls} value={e.config.colchao_ativo_id ?? ""}
                  onChange={(ev) => set("config", { ...e.config, colchao_ativo_id: ev.target.value || null })}>
                  <option value="">Nenhum</option>
                  {e.ativos.map((a) => <option key={a.id} value={a.id}>{a.codigo || "Sem código"}</option>)}
                </select>
              </Campo>
              <Campo label="Cobertura mínima desejada (meses)">
                <DecimalInput value={e.config.colchao_min_meses} casas={0} ariaLabel="Cobertura mínima em meses"
                  onValue={(v) => set("config", { ...e.config, colchao_min_meses: Math.max(0, Math.round(v ?? 0)) })} />
              </Campo>
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed">
              {colchao
                ? `A cobertura em meses de saque de ${colchao.codigo || "colchão"} aparece aqui assim que houver cotações.`
                : "Sem colchão: quando nenhum ativo estiver acima do alvo, o saque sai do ativo mais perto do alvo, que é o menos prejudicado pela venda."}
            </p>
          </div>
        </Secao>

        <Secao titulo="Impostos" recolhivel
          descricao="Imposto de renda sobre o ganho na venda, por tipo de ativo. Aparecem os tipos usados na sua carteira. Os valores iniciais seguem a legislação brasileira para pessoa física residente; ajuste se as regras mudarem ou se a sua situação fiscal for outra.">
          {chavesImposto.length === 0 ? (
            <p className="text-sm text-muted-foreground">Cadastre ativos para ver as alíquotas.</p>
          ) : (
            <div className="divide-y divide-border">
              {chavesImposto.map((d) => (
                <div key={d.k} className="flex items-start gap-3 py-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-foreground">{d.nome} <span className="font-normal text-muted-foreground">· {d.usados}</span></p>
                    <p className="text-[11px] text-muted-foreground leading-snug">{d.nota}</p>
                  </div>
                  <div className="flex items-center gap-1 w-24 flex-shrink-0">
                    <DecimalInput value={aliquota(d.k)} ariaLabel={`Alíquota de ${d.nome}`}
                      onValue={(v) => set("config", { ...e.config, aliquotas: { ...e.config.aliquotas, [d.k]: v ?? 0 } })} />
                    <span className="text-sm text-muted-foreground">%</span>
                  </div>
                </div>
              ))}
            </div>
          )}
          <p className="text-[11px] text-muted-foreground mt-3">O app estima o imposto e não substitui um contador.</p>
        </Secao>
      </fieldset>

      {/* Barra de salvar: fixa no rodapé (acima da barra de navegação no celular) */}
      {!isReadOnly && (
        <div className="fixed left-0 right-0 bottom-[4.5rem] lg:bottom-0 lg:left-64 z-20 border-t border-border bg-card/95 backdrop-blur px-4 py-3">
          <div className="max-w-5xl mx-auto flex items-center gap-3">
            <p className="flex-1 min-w-0 text-xs font-medium truncate" style={{ color: erro ? "#B42318" : "var(--muted-foreground)" }}>
              {erro || (alterado ? "Alterações não salvas" : "Tudo salvo")}
            </p>
            {alterado && (
              <button type="button" disabled={salvando}
                onClick={() => { setE(JSON.parse(base)); setErro(""); }}
                className="px-3 py-2 rounded-lg text-sm font-semibold border border-border hover:bg-secondary/50 transition-colors">
                Descartar
              </button>
            )}
            <button type="button" onClick={salvar} disabled={!alterado || salvando}
              className="px-4 py-2 rounded-lg text-sm font-semibold text-white flex items-center gap-2 transition-opacity disabled:opacity-50"
              style={{ backgroundColor: ACCENT }}>
              {salvando && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              Salvar configurações
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
