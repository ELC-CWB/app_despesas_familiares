"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { fmtBRL, fmtNum } from "@/lib/carteira/numeros";
import {
  ANOS_PERPETUO, anosDesde, barrasPorAno, corrigir, descreverMudancas, dinheiroCurto, fatorIpcaAte, fatoresPorAno,
  horizonte, interpolar, projetarTunel, rentPessEfetiva, resumoPremissas, serieNominal, statusTunel,
  textoVeredito, vereditoPerpetuidade, type FotoPatrimonio, type IpcaMes, type Premissas, type VersaoPlano,
} from "@/lib/carteira/plano";
import type { RegrasRetirada } from "@/app/api/carteira/regras/route";
import { ACCENT, DecimalInput, inputCls, VERMELHO } from "@/components/carteira/campos";
import { BarrasChart, TunelChart } from "@/components/carteira/plano-graficos";

// Plano (docs/carteira/SPEC.md §4.3). O usuário vê UM valor de patrimônio (o nominal, igual ao da Visão
// geral); o túnel e as cifras do plano são corrigidos pelo IPCA e rotulados "em reais de hoje" (REGRAS §2).

type Snapshot = FotoPatrimonio;

const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const mesAno = (iso: string) => `${MESES[Number(iso.slice(5, 7)) - 1]}/${iso.slice(0, 4)}`;
const pct = (v: number, c = 2) => `${fmtNum(v, 0, c)}%`;
const brl0 = (v: number) => fmtBRL(v, 0);

const premissasDe = (v: Premissas): Premissas => ({
  ano_inicio: v.ano_inicio, patrimonio_inicial: v.patrimonio_inicial, aporte_mensal: v.aporte_mensal, anos_aporte: v.anos_aporte,
  perpetuo: v.perpetuo, anos_usufruto: v.perpetuo ? null : v.anos_usufruto, retirada_pct: v.retirada_pct,
  rent_pess_pct: v.rent_pess_pct, rent_otim_pct: v.rent_otim_pct,
});

export function PlanoClient({
  isReadOnly, ownerName, hoje, anoMinimo, patrimonioHoje, investidoHoje, versoes, ipca, ipcaFonte, snapshots, regras,
}: {
  isReadOnly: boolean;
  ownerName: string | null;
  hoje: string;
  anoMinimo: number; // primeiro ano com IPCA carregado
  patrimonioHoje: number;
  investidoHoje: number;
  versoes: VersaoPlano[];
  ipca: IpcaMes[];
  ipcaFonte: "bcb" | "banco" | null;
  snapshots: Snapshot[];
  regras: RegrasRetirada;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const anoAtual = Number(hoje.slice(0, 4));
  const emUso = versoes.find((v) => v.em_uso) ?? null;

  const [prem, setPrem] = useState<Premissas>(() => emUso ? premissasDe(emUso) : {
    ano_inicio: anoAtual, patrimonio_inicial: Math.round(patrimonioHoje / 1000) * 1000, aporte_mensal: 3000, anos_aporte: 20,
    perpetuo: true, anos_usufruto: null, retirada_pct: 3.5, rent_pess_pct: 3, rent_otim_pct: 6,
  });
  const [ultimoPrazo, setUltimoPrazo] = useState(30); // volta a este prazo ao sair do infinito
  const [vendoId, setVendoId] = useState<string | null>(null);
  const [dialogo, setDialogo] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");
  const [reg, setReg] = useState<RegrasRetirada>(regras);
  const [salvandoReg, setSalvandoReg] = useState(false);

  const base = vendoId ? versoes.find((v) => v.id === vendoId) ?? null : emUso;
  const mudancas = base ? descreverMudancas(premissasDe(base), prem) : [];
  const alterado = base ? mudancas.length > 0 : true;
  const vendoAntiga = !!vendoId && vendoId !== emUso?.id;

  const set = <K extends keyof Premissas>(k: K, v: Premissas[K]) => { setErro(""); setPrem((p) => ({ ...p, [k]: v })); };
  const carregar = (v: VersaoPlano | null, vendo: string | null) => { if (v) setPrem(premissasDe(v)); setVendoId(vendo); setErro(""); };

  // ── Projeção, corrigida pela inflação ──
  const T = horizonte(prem);
  const A = prem.anos_aporte;
  const tunel = useMemo(() => projetarTunel(prem), [prem]);
  const fatores = useMemo(() => fatoresPorAno(ipca, prem.ano_inicio, hoje, T), [ipca, prem.ano_inicio, hoje, T]);
  const pessC = useMemo(() => corrigir(tunel.pess.valores, fatores), [tunel, fatores]);
  const otimC = useMemo(() => corrigir(tunel.otim.valores, fatores), [tunel, fatores]);
  const inflacao = (fatorIpcaAte(ipca, prem.ano_inicio, hoje) - 1) * 100;

  const tHoje = anosDesde(prem.ano_inicio, hoje);
  const noPeriodo = tHoje >= 0 && tHoje <= T;
  const faixaHoje = noPeriodo ? { pess: interpolar(pessC, tHoje), otim: interpolar(otimC, tHoje) } : null;
  const status = statusTunel(patrimonioHoje, faixaHoje);

  const ret = prem.retirada_pct / 100;
  const pessMensal = (pessC[A] * ret) / 12;
  const veredito = vereditoPerpetuidade(prem.retirada_pct, rentPessEfetiva(prem.rent_pess_pct, prem.rent_otim_pct), prem.rent_otim_pct);
  const textoV = textoVeredito(veredito, prem, pessMensal);

  const serie = serieNominal(snapshots, prem.ano_inicio, prem.patrimonio_inicial, hoje, patrimonioHoje);
  const barras = barrasPorAno(snapshots, anoAtual, patrimonioHoje, investidoHoje);

  // ── Ações ──
  const salvar = async (modo: "atualizar" | "nova") => {
    setSalvando(true);
    setErro("");
    try {
      const res = await fetch("/api/carteira/planos", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...prem, modo }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? "Erro ao salvar o plano");
      setDialogo(false);
      toast({ title: modo === "nova" || !emUso ? `Plano salvo como versão ${(versoes[0]?.versao ?? 0) + 1}` : `Versão ${emUso.versao} atualizada` });
      router.refresh();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro ao salvar o plano");
    } finally {
      setSalvando(false);
    }
  };

  const usarVersao = async (id: string) => {
    setSalvando(true);
    try {
      const res = await fetch("/api/carteira/planos/usar", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? "Erro ao trocar a versão");
      toast({ title: "Versão em uso trocada" });
      router.refresh();
    } catch (e) {
      toast({ variant: "destructive", title: "Erro", description: e instanceof Error ? e.message : String(e) });
    } finally {
      setSalvando(false);
    }
  };

  const salvarRegras = async () => {
    setSalvandoReg(true);
    try {
      const res = await fetch("/api/carteira/regras", {
        method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(reg),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? "Erro ao salvar as regras");
      toast({ title: "Regras de ajuste salvas" });
      router.refresh();
    } catch (e) {
      toast({ variant: "destructive", title: "Erro", description: e instanceof Error ? e.message : String(e) });
    } finally {
      setSalvandoReg(false);
    }
  };
  const regrasAlteradas = JSON.stringify(reg) !== JSON.stringify(regras);

  const corVeredito = veredito === "verde" ? "#2E6B3F" : veredito === "amarelo" ? "#8A5A00" : VERMELHO;

  const faixaTxt = `${pct(rentPessEfetiva(prem.rent_pess_pct, prem.rent_otim_pct), 2)} a ${pct(prem.rent_otim_pct, 2)} ao ano`;

  return (
    <div className="space-y-4">
      {isReadOnly && (
        <div className="rounded-lg px-3 py-1.5 text-xs font-medium" style={{ backgroundColor: `${ACCENT}0d`, color: ACCENT }}>
          👁 Você está vendo o plano de <strong>{ownerName ?? "outro membro"}</strong>, somente leitura. Pode simular, mas não salvar.
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        {emUso ? <>Plano versão {emUso.versao} · criada em {mesAno(emUso.criado_em)} · valores em reais de hoje</> : "Nenhum plano salvo ainda. Ajuste as premissas e salve."}
      </p>

      {/* ── Resumo, na largura inteira da página ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <Cartao rotulo="Patrimônio hoje" valor={brl0(patrimonioHoje)}
          sub={faixaHoje ? `faixa do plano para ${anoAtual}: ${dinheiroCurto(faixaHoje.pess)} a ${dinheiroCurto(faixaHoje.otim)}` : "fora do período do plano"} />
        <Cartao rotulo={`Patrimônio no início do usufruto em ${prem.ano_inicio + A}`} valor={`${dinheiroCurto(pessC[A])} a ${dinheiroCurto(otimC[A])}`} />
        <Cartao rotulo="Retirada mensal bruta" valor={`${brl0(pessMensal)} a ${brl0((otimC[A] * ret) / 12)}`} />
        <Cartao rotulo={`Patrimônio no final do usufruto em ${prem.ano_inicio + T}`} valor={`${dinheiroCurto(Math.max(0, pessC[T]))} a ${dinheiroCurto(Math.max(0, otimC[T]))}`} />
      </div>

      <div className="rounded-lg px-3 py-1.5 text-xs flex flex-wrap items-center gap-x-2"
        style={status.tipo === "abaixo" ? { backgroundColor: "rgba(180,35,24,0.10)", color: VERMELHO }
          : status.tipo === "acima" ? { backgroundColor: "rgba(46,107,63,0.10)", color: "#2E6B3F" }
          : { backgroundColor: "rgba(31,50,71,0.08)", color: "var(--foreground)" }}>
        <strong>
          {status.tipo === "abaixo" ? "Abaixo do túnel" : status.tipo === "acima" ? "Acima do túnel" : status.tipo === "dentro" ? "Dentro do túnel" : "Fora do período do plano"}
        </strong>
        <span className="opacity-80">
          {status.tipo === "abaixo" && `· faltam ${brl0(status.diferenca)} para a borda pessimista`}
          {status.tipo === "acima" && `· ${brl0(status.diferenca)} acima da borda otimista`}
          {status.tipo === "dentro" && `· plano em dia em ${anoAtual}`}
        </span>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(300px,25%)_minmax(0,1fr)] gap-4 items-start">
        {/* ── Premissas do plano: veredito, sugestão de ajuste, salvar e versões ficam dentro do cartão ── */}
        <section className="rounded-2xl border border-border bg-card p-4 sm:p-5 shadow-sm space-y-4">
          <h2 className="text-base font-bold text-foreground" style={{ fontFamily: "Sora, sans-serif" }}>Premissas do plano</h2>

          <Premissa rotulo="Início do plano (ano)" valor={prem.ano_inicio} casas={0} min={anoMinimo} max={anoAtual + 5} passo={1}
            onChange={(v) => set("ano_inicio", Math.min(anoAtual + 5, Math.max(anoMinimo, Math.round(v))))} />
          <Premissa rotulo="Patrimônio inicial (R$)" valor={prem.patrimonio_inicial} casas={2} min={0}
            max={Math.max(500000, Math.ceil((prem.patrimonio_inicial * 1.5) / 100000) * 100000)} passo={10000}
            onChange={(v) => set("patrimonio_inicial", v)} />
          <Premissa rotulo="Aporte mensal (R$)" valor={prem.aporte_mensal} casas={2} min={0}
            max={Math.max(30000, Math.ceil((prem.aporte_mensal * 1.5) / 5000) * 5000)} passo={500}
            onChange={(v) => set("aporte_mensal", v)} />
          <Premissa rotulo="Anos de aporte" periodo={prem.anos_aporte > 0 ? `${prem.ano_inicio} a ${prem.ano_inicio + prem.anos_aporte - 1}` : "sem aportes"} valor={prem.anos_aporte} casas={0} min={0} max={50} passo={1}
            onChange={(v) => set("anos_aporte", Math.round(v))} />
          <PremissaUsufruto anoInicial={prem.ano_inicio + prem.anos_aporte} perpetuo={prem.perpetuo} anos={prem.anos_usufruto ?? ultimoPrazo}
            onPrazo={(n) => { setUltimoPrazo(n); setErro(""); setPrem((p) => ({ ...p, perpetuo: false, anos_usufruto: n })); }}
            onPerpetuo={() => { setErro(""); setPrem((p) => ({ ...p, perpetuo: true, anos_usufruto: null })); }} />
          <Premissa rotulo="Retirada anual bruta (%)" valor={prem.retirada_pct} casas={2} min={1} max={8} passo={0.25}
            onChange={(v) => set("retirada_pct", v)} />
          <Premissa rotulo="Rentabilidade real pessimista (% a.a.)" valor={prem.rent_pess_pct} casas={2} min={0} max={8} passo={0.5}
            onChange={(v) => set("rent_pess_pct", v)} />
          <Premissa rotulo="Rentabilidade real otimista (% a.a.)" valor={prem.rent_otim_pct} casas={2} min={1} max={10} passo={0.5}
            onChange={(v) => set("rent_otim_pct", v)} />
          {prem.rent_pess_pct >= prem.rent_otim_pct && (
            <p className="text-[11px]" style={{ color: VERMELHO }}>A pessimista precisa ser menor que a otimista; no gráfico ela é limitada a {pct(rentPessEfetiva(prem.rent_pess_pct, prem.rent_otim_pct), 1)}.</p>
          )}

          {prem.perpetuo && (
            <div className="rounded-xl px-3 py-2.5" style={{ backgroundColor: `${corVeredito}14`, color: corVeredito }}>
              <p className="text-sm font-bold leading-tight">{textoV.titulo}</p>
              <p className="text-xs leading-snug mt-1">{textoV.texto}</p>
            </div>
          )}

          {/* Sugestão de ajuste da retirada (SPEC §4.3) */}
          <details className="group rounded-xl border border-border">
            <summary className="px-3.5 py-3 cursor-pointer flex items-center gap-2 list-none [&::-webkit-details-marker]:hidden">
              <ChevronDown className="h-3.5 w-3.5 text-muted-foreground transition-transform -rotate-90 group-open:rotate-0" aria-hidden />
              <span className="text-xs font-semibold uppercase tracking-wide text-foreground">Ajuste de retirada</span>
            </summary>
            <div className="px-3.5 pb-3.5 space-y-3 border-t border-border pt-3">
              <p className="text-[11px] text-muted-foreground">O app sugere e você decide. A proteção é avaliada primeiro.</p>
              <Regra titulo="Proteção nas quedas" ligada={reg.regra_protecao_on} desabilitado={isReadOnly}
                onLigar={(v) => setReg((r) => ({ ...r, regra_protecao_on: v }))}
                r1={{ rotulo: "Abaixo do pico", valor: reg.regra_queda_pct, on: (v) => setReg((r) => ({ ...r, regra_queda_pct: v })) }}
                r2={{ rotulo: "Redução", valor: reg.regra_corte_pct, on: (v) => setReg((r) => ({ ...r, regra_corte_pct: v })) }}
                descricao={`Queda maior que ${reg.regra_queda_pct}% do pico: sugere reduzir a retirada em ${reg.regra_corte_pct}%, até a carteira recuperar o pico.`} />
              <Regra titulo="Aumento quando a carteira cresce" ligada={reg.regra_aumento_on} desabilitado={isReadOnly}
                onLigar={(v) => setReg((r) => ({ ...r, regra_aumento_on: v }))}
                r1={{ rotulo: "Retirada abaixo de", valor: reg.regra_gatilho_pct, on: (v) => setReg((r) => ({ ...r, regra_gatilho_pct: v })) }}
                r2={{ rotulo: "Aumento", valor: reg.regra_aumento_pct, on: (v) => setReg((r) => ({ ...r, regra_aumento_pct: v })) }}
                descricao={`Revisão anual: se a retirada ficar abaixo de ${reg.regra_gatilho_pct}% do saldo, sugere aumentá-la em ${reg.regra_aumento_pct}%.`} />
              {!isReadOnly && regrasAlteradas && (
                <button type="button" onClick={salvarRegras} disabled={salvandoReg}
                  className="w-full py-1.5 rounded-lg text-xs font-semibold text-white flex items-center justify-center gap-1.5 disabled:opacity-60" style={{ backgroundColor: ACCENT }}>
                  {salvandoReg && <Loader2 className="h-3 w-3 animate-spin" />}Salvar regras
                </button>
              )}
            </div>
          </details>

          {vendoAntiga && base && (
            <div className="rounded-lg px-3 py-2 space-y-1.5 text-xs" style={{ backgroundColor: "rgba(59,130,246,0.10)", color: "#1A4A82" }}>
              <p>Você está vendo a <strong>versão {base.versao}</strong> (criada em {mesAno(base.criado_em)}). O plano em uso é a versão {emUso?.versao}.</p>
              <p className="flex flex-wrap gap-x-4">
                <button type="button" className="font-semibold underline" onClick={() => carregar(emUso, null)}>Voltar à versão {emUso?.versao}</button>
                {!isReadOnly && (
                  <button type="button" className="font-semibold underline" disabled={salvando} onClick={() => usarVersao(base.id)}>Usar a versão {base.versao}</button>
                )}
              </p>
            </div>
          )}

          {!isReadOnly && !vendoAntiga && (
            <div className="space-y-2">
              {emUso && alterado && (
                <p className="rounded-lg px-2.5 py-2 text-xs" style={{ backgroundColor: "rgba(138,90,0,0.10)", color: "#8A5A00" }}>
                  As premissas foram alteradas e ainda não foram salvas.
                </p>
              )}
              {erro && <p className="text-xs font-medium" style={{ color: VERMELHO }}>{erro}</p>}
              <button type="button" disabled={!alterado || salvando}
                onClick={() => (emUso ? setDialogo(true) : salvar("atualizar"))}
                className="w-full py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-40 flex items-center justify-center gap-1.5"
                style={{ backgroundColor: alterado ? "#1F3247" : "#A3ACB6" }}>
                {salvando && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                {emUso ? "Salvar plano" : "Criar plano"}
              </button>
            </div>
          )}

          {versoes.length > 0 && (
            <details className="group text-sm">
              <summary className="cursor-pointer flex items-center gap-2 list-none [&::-webkit-details-marker]:hidden font-semibold text-foreground">
                <ChevronDown className="h-3.5 w-3.5 text-muted-foreground transition-transform -rotate-90 group-open:rotate-0" aria-hidden />
                Versões do plano ({versoes.length})
              </summary>
              <div className="mt-2 divide-y divide-border">
                {versoes.map((v) => (
                  <div key={v.id} className="py-2 flex items-start justify-between gap-2" style={vendoId === v.id ? { backgroundColor: "rgba(59,130,246,0.06)" } : undefined}>
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-foreground">
                        Versão {v.versao} · {mesAno(v.criado_em)}
                        {v.atualizado_em.slice(0, 10) !== v.criado_em.slice(0, 10) && <span className="font-normal text-muted-foreground"> (atualizada em {mesAno(v.atualizado_em)})</span>}
                      </p>
                      <p className="text-[11px] text-muted-foreground leading-snug">{resumoPremissas(v)}</p>
                    </div>
                    {v.em_uso ? (
                      <button type="button" onClick={() => carregar(v, null)} className="text-[11px] font-bold flex-none" style={{ color: "#2E6B3F" }}>em uso</button>
                    ) : (
                      <button type="button" onClick={() => carregar(v, v.id)} className="text-[11px] font-bold flex-none" style={{ color: "#1A4A82" }}>
                        {vendoId === v.id ? "visualizando" : "ver"}
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </details>
          )}
        </section>

        {/* ── Túnel e barras, na coluna larga ── */}
        <div className="space-y-4 min-w-0">
          <section className="rounded-2xl border border-border bg-card p-4 sm:p-5 shadow-sm space-y-3">
            <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
              <h2 className="text-base font-bold text-foreground" style={{ fontFamily: "Sora, sans-serif" }}>Túnel do plano</h2>
              <p className="text-xs text-muted-foreground flex flex-wrap gap-x-4 gap-y-1">
                <span className="flex items-center gap-1.5">
                  <span className="inline-block w-3.5 h-2.5 rounded-sm" style={{ backgroundColor: "rgba(59,130,246,0.22)", border: "1px solid rgba(59,130,246,0.55)" }} />
                  Faixa do plano ({faixaTxt})
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="inline-block flex-none" style={{ width: 16, height: 3, backgroundColor: "var(--foreground)" }} />Patrimônio
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="inline-block w-3.5 h-2.5 rounded-sm" style={{ backgroundColor: "rgba(217,58,50,0.10)", border: "1px solid rgba(217,58,50,0.30)" }} />
                  Período de usufruto (com retiradas)
                </span>
              </p>
            </div>
            <TunelChart anoInicio={prem.ano_inicio} anosAporte={A} horizonte={T} pess={pessC} otim={otimC}
              esgota={tunel.pess.esgota} patrimonio={serie} hoje={tHoje > 0 && tHoje <= T ? { t: tHoje, v: patrimonioHoje } : null}
              preservar={prem.perpetuo ? pessC[A] : null} />
            <p className="text-[11px] text-muted-foreground leading-snug">
              Valores em reais de hoje.{" "}
              {ipcaFonte
                ? <>O plano começa em {prem.ano_inicio} e a inflação acumulada desde então é de {fmtNum(inflacao, 1, 1)}%; as faixas já estão corrigidas por ela (IPCA, {ipcaFonte === "bcb" ? "Banco Central" : "último valor salvo"}).</>
                : <>Não foi possível obter o IPCA agora: as faixas do plano estão sem correção pela inflação.</>}
              {prem.perpetuo && ` No usufruto perpétuo são exibidos ${ANOS_PERPETUO} anos.`}
            </p>
          </section>

          <section className="rounded-2xl border border-border bg-card p-4 sm:p-5 shadow-sm space-y-3">
            <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
              <h2 className="text-base font-bold text-foreground" style={{ fontFamily: "Sora, sans-serif" }}>Investido líquido x patrimônio</h2>
              <p className="text-xs text-muted-foreground flex gap-4">
                <span className="flex items-center gap-1.5"><span className="inline-block w-3 h-3 rounded-sm" style={{ backgroundColor: "#10b981" }} />Ganho</span>
                <span className="flex items-center gap-1.5"><span className="inline-block w-3 h-3 rounded-sm" style={{ backgroundColor: "#A3ACB6" }} />Investido líquido</span>
              </p>
            </div>
            <BarrasChart barras={barras} />
            <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm text-muted-foreground">
              <span>Investido líquido: <strong className="font-medium tabular-nums text-foreground">{brl0(investidoHoje)}</strong></span>
              <span>Patrimônio hoje: <strong className="font-medium tabular-nums text-foreground">{brl0(patrimonioHoje)}</strong></span>
              <span>Ganho acumulado: <strong className="font-medium tabular-nums" style={{ color: patrimonioHoje - investidoHoje >= 0 ? "#2E6B3F" : VERMELHO }}>
                {patrimonioHoje - investidoHoje >= 0 ? "+" : "−"}{brl0(Math.abs(patrimonioHoje - investidoHoje))}
              </strong></span>
            </div>
          </section>
        </div>
      </div>

      {/* ── Diálogo de salvar ── */}
      {dialogo && emUso && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setDialogo(false)}>
          <div className="w-full max-w-md rounded-2xl border border-border bg-card p-5 shadow-xl space-y-3" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-base font-bold text-foreground" style={{ fontFamily: "Sora, sans-serif" }}>Salvar plano</h3>
            <p className="text-sm text-muted-foreground">Você alterou: {mudancas.join(", ")}.</p>
            <div className="grid gap-2">
              <button type="button" disabled={salvando} onClick={() => salvar("atualizar")}
                className="rounded-xl border border-border p-3 text-left hover:bg-secondary/40 transition-colors">
                <p className="text-sm font-bold text-foreground">Atualizar a versão {emUso.versao}</p>
                <p className="text-xs text-muted-foreground">Substitui as premissas da versão em uso.</p>
              </button>
              <button type="button" disabled={salvando} onClick={() => salvar("nova")}
                className="rounded-xl border-2 p-3 text-left hover:bg-secondary/40 transition-colors" style={{ borderColor: ACCENT }}>
                <p className="text-sm font-bold text-foreground">Salvar como versão {(versoes[0]?.versao ?? emUso.versao) + 1}</p>
                <p className="text-xs text-muted-foreground">Mantém a versão {emUso.versao} no histórico e passa a usar a nova.</p>
              </button>
            </div>
            {erro && <p className="text-xs font-medium" style={{ color: VERMELHO }}>{erro}</p>}
            <div className="flex justify-end">
              <button type="button" onClick={() => setDialogo(false)} className="px-3 py-1.5 rounded-lg text-sm font-semibold border border-border hover:bg-secondary/50">Cancelar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Peças ──────────────────────────────────────────────────────────────────────

function Premissa({
  rotulo, periodo, valor, casas, min, max, passo, onChange,
}: {
  rotulo: string; periodo?: string; valor: number; casas: number; min: number; max: number; passo: number; onChange: (v: number) => void;
}) {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-semibold text-muted-foreground leading-tight">
          {rotulo}
          {periodo && <span className="block text-[11px] font-medium tabular-nums">{periodo}</span>}
        </span>
        <DecimalInput value={valor} casas={casas} ariaLabel={rotulo} className={`${inputCls} h-7 w-28 py-0 text-xs`} onValue={(v) => onChange(v ?? 0)} />
      </div>
      <input type="range" min={min} max={Math.max(max, valor)} step={passo} value={Math.min(Math.max(valor, min), Math.max(max, valor))}
        onChange={(e) => onChange(Number(e.target.value))} aria-label={rotulo} className="w-full h-1.5 cursor-pointer" style={{ accentColor: ACCENT }} />
    </div>
  );
}

// Anos de usufruto com a opção infinito (∞ = usufruto perpétuo). O fim da escala do deslizador é o ∞.
const MAX_ANOS_USUFRUTO = 60;

function PremissaUsufruto({
  anoInicial, perpetuo, anos, onPrazo, onPerpetuo,
}: {
  anoInicial: number; perpetuo: boolean; anos: number; onPrazo: (n: number) => void; onPerpetuo: () => void;
}) {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-semibold text-muted-foreground leading-tight">
          Anos de usufruto
          <span className="block text-[11px] font-medium tabular-nums">{perpetuo ? `${anoInicial} em diante` : `${anoInicial} a ${anoInicial + anos - 1}`}</span>
        </span>
        <span className="flex items-center gap-1">
          {perpetuo ? (
            <span className={`${inputCls} h-7 w-[5.5rem] py-0 text-xs flex items-center justify-end text-muted-foreground`}>perpétuo</span>
          ) : (
            <DecimalInput value={anos} casas={0} ariaLabel="Anos de usufruto" className={`${inputCls} h-7 w-[5.5rem] py-0 text-xs`}
              onValue={(v) => onPrazo(Math.max(1, Math.round(v ?? 1)))} />
          )}
          <button type="button" aria-pressed={perpetuo} title="Usufruto perpétuo (infinito)"
            onClick={() => (perpetuo ? onPrazo(anos) : onPerpetuo())}
            className="h-7 w-8 rounded-lg border text-base font-bold leading-none transition-colors"
            style={perpetuo ? { backgroundColor: ACCENT, borderColor: ACCENT, color: "#fff" } : { borderColor: "var(--border)", color: "var(--muted-foreground)" }}>
            ∞
          </button>
        </span>
      </div>
      <input type="range" min={1} max={MAX_ANOS_USUFRUTO + 1} step={1} aria-label="Anos de usufruto (o fim da escala é o infinito)"
        value={perpetuo ? MAX_ANOS_USUFRUTO + 1 : Math.min(Math.max(anos, 1), MAX_ANOS_USUFRUTO)}
        onChange={(e) => { const v = Number(e.target.value); if (v > MAX_ANOS_USUFRUTO) onPerpetuo(); else onPrazo(v); }}
        className="w-full h-1.5 cursor-pointer" style={{ accentColor: ACCENT }} />
      <div className="flex justify-between text-[10px] text-muted-foreground"><span>1 ano</span><span>{MAX_ANOS_USUFRUTO} anos</span><span>∞</span></div>
    </div>
  );
}

function Cartao({ rotulo, valor, sub }: { rotulo: string; valor: string; sub?: string }) {
  return (
    <div className="rounded-2xl border border-border bg-card px-3 py-2.5 shadow-sm">
      <p className="text-[11px] text-muted-foreground font-medium leading-tight">{rotulo}</p>
      <p className="text-base font-bold text-foreground tabular-nums mt-0.5 leading-tight">{valor}</p>
      {sub && <p className="text-[11px] text-muted-foreground leading-tight mt-0.5">{sub}</p>}
    </div>
  );
}

function Regra({
  titulo, ligada, desabilitado, onLigar, r1, r2, descricao,
}: {
  titulo: string; ligada: boolean; desabilitado: boolean; onLigar: (v: boolean) => void; descricao: string;
  r1: { rotulo: string; valor: number; on: (v: number) => void };
  r2: { rotulo: string; valor: number; on: (v: number) => void };
}) {
  return (
    <div className="rounded-xl border border-border p-3 space-y-2.5" style={{ opacity: ligada ? 1 : 0.55 }}>
      <label className="flex items-start gap-2 cursor-pointer">
        <input type="checkbox" checked={ligada} disabled={desabilitado} onChange={(e) => onLigar(e.target.checked)}
          className="mt-0.5 h-4 w-4 flex-none" style={{ accentColor: ACCENT }} />
        <span className="text-sm font-bold text-foreground leading-snug">{titulo}</span>
      </label>
      {/* Rótulos de uma linha só e o % dentro da caixa: as duas caixas ficam alinhadas */}
      <div className="grid grid-cols-2 gap-3">
        {[r1, r2].map((c) => (
          <label key={c.rotulo} className="block min-w-0">
            <span className="block text-[11px] font-semibold text-muted-foreground mb-1 truncate" title={c.rotulo}>{c.rotulo}</span>
            <span className="relative block">
              <DecimalInput value={c.valor} casas={2} disabled={desabilitado || !ligada} ariaLabel={`${c.rotulo} (%)`}
                className={`${inputCls} h-8 py-0 pr-7 text-xs`} onValue={(v) => c.on(v ?? 0)} />
              <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground pointer-events-none">%</span>
            </span>
          </label>
        ))}
      </div>
      <p className="text-[11px] text-muted-foreground leading-snug">{descricao}</p>
    </div>
  );
}
