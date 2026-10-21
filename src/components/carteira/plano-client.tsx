"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, Loader2, Plus } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { fmtBRL, fmtNum } from "@/lib/carteira/numeros";
import {
  ANOS_PERPETUO, anosAporteEfetivo, anosDesde, descreverRevisao, barrasPlanejadas, barrasPorAno, corrigir, descreverMudancas, dinheiroCurto, fatorIpcaAte, fatoresPorAno,
  horizonte, interpolar, parametrosDoAno, projetarTunel, temposDasRevisoes, rentPessEfetiva, resumoPremissas, serieNominal, statusTunel,
  textoVeredito, vereditoPerpetuidade, type FotoPatrimonio, type IpcaMes, type Premissas, type Revisao, type VersaoPlano,
} from "@/lib/carteira/plano";
import type { RegrasRetirada } from "@/app/api/carteira/regras/route";
import { validarRevisoes } from "@/lib/carteira/validacao";
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
  revisoes: [...(v.revisoes ?? [])].sort((a, b) => a.ano - b.ano),
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
    perpetuo: true, anos_usufruto: null, retirada_pct: 3.5, rent_pess_pct: 3, rent_otim_pct: 6, revisoes: [],
  });
  const [ultimoPrazo, setUltimoPrazo] = useState(30); // volta a este prazo ao sair do infinito
  const [vendoId, setVendoId] = useState<string | null>(null);
  const [dialogo, setDialogo] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");
  const [reg, setReg] = useState<RegrasRetirada>(regras);
  const [salvandoReg, setSalvandoReg] = useState(false);
  const [barrasMostrar, setBarrasMostrar] = useState({ real: true, plano: true }); // filtro do gráfico de barras

  const base = vendoId ? versoes.find((v) => v.id === vendoId) ?? null : emUso;
  const mudancas = base ? descreverMudancas(premissasDe(base), prem) : [];
  const alterado = base ? mudancas.length > 0 : true;
  const vendoAntiga = !!vendoId && vendoId !== emUso?.id;

  const set = <K extends keyof Premissas>(k: K, v: Premissas[K]) => { setErro(""); setPrem((p) => ({ ...p, [k]: v })); };
  const carregar = (v: VersaoPlano | null, vendo: string | null) => { if (v) setPrem(premissasDe(v)); setVendoId(vendo); setErro(""); };

  // ── Projeção, corrigida pela inflação ──
  const T = horizonte(prem);
  const A = anosAporteEfetivo(prem); // com a revisão do último ano de aporte, se houver
  const tunel = useMemo(() => projetarTunel(prem), [prem]);
  const fatores = useMemo(() => fatoresPorAno(ipca, prem.ano_inicio, hoje, T), [ipca, prem.ano_inicio, hoje, T]);
  const pessC = useMemo(() => corrigir(tunel.pess.valores, fatores), [tunel, fatores]);
  const otimC = useMemo(() => corrigir(tunel.otim.valores, fatores), [tunel, fatores]);
  const inflacao = (fatorIpcaAte(ipca, prem.ano_inicio, hoje) - 1) * 100;

  const tHoje = anosDesde(prem.ano_inicio, hoje);
  const noPeriodo = tHoje >= 0 && tHoje <= T;
  const faixaHoje = noPeriodo ? { pess: interpolar(pessC, tHoje), otim: interpolar(otimC, tHoje) } : null;
  const status = statusTunel(patrimonioHoje, faixaHoje);

  const efA = parametrosDoAno(prem, A); // valores em vigor no início do usufruto (com as revisões)
  const ret = efA.retirada / 100;
  const pessMensal = (pessC[A] * ret) / 12;
  const veredito = vereditoPerpetuidade(efA.retirada, rentPessEfetiva(efA.pess, efA.otim), efA.otim);
  const textoV = textoVeredito(veredito, { ...prem, retirada_pct: efA.retirada, rent_pess_pct: efA.pess, rent_otim_pct: efA.otim }, pessMensal);
  const fimPlano = prem.ano_inicio + T;
  const revisoes = prem.revisoes ?? [];
  const avisoRevisoes = validarRevisoes(prem as Parameters<typeof validarRevisoes>[0]); // o mesmo teste do servidor
  const setRevisoes = (lista: Revisao[]) => { setErro(""); setPrem((p) => ({ ...p, revisoes: lista })); };

  const serie = serieNominal(snapshots, prem.ano_inicio, prem.patrimonio_inicial, hoje, patrimonioHoje);
  const barras = barrasPorAno(snapshots, anoAtual, patrimonioHoje, investidoHoje);
  // Com o planejado ligado, o gráfico segue até o fim do plano, só com o que o plano prevê nos anos que vêm (ainda não há real)
  const anosFuturos = Array.from({ length: Math.max(0, prem.ano_inicio + T - anoAtual) }, (_, i) => anoAtual + 1 + i);
  const barrasGrafico = barrasMostrar.plano
    ? [...barras, ...anosFuturos.map((ano) => ({ ano, patrimonio: 0, investido: 0, semReal: true }))]
    : barras;
  const planejado = barrasPlanejadas(prem, pessC, otimC, fatores, barrasGrafico.map((b) => b.ano), anoAtual, tHoje, tunel.pess.saques);

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
        {emUso ? (
          <>
            Plano versão {emUso.versao} · criado em {mesAno(emUso.criado_em)}
            {/* só a revisão mais recente (a em uso); o detalhe de todas fica em Versões do plano */}
            {(() => {
              const lista = [...(emUso.revisoes ?? [])].sort((x, y) => x.ano - y.ano);
              const ultima = lista.at(-1);
              return ultima ? (
                <span className="block">Revisão {lista.length} · criada em {ultima.criado_em ? mesAno(ultima.criado_em) : "—"}</span>
              ) : null;
            })()}
          </>
        ) : "Nenhum plano salvo ainda. Ajuste as premissas e salve."}
      </p>

      {/* ── Resumo, na largura inteira da página ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <Cartao rotulo="Patrimônio hoje" valor={brl0(patrimonioHoje)}
          sub={faixaHoje ? `faixa do plano para ${anoAtual}: ${dinheiroCurto(faixaHoje.pess)} a ${dinheiroCurto(faixaHoje.otim)}` : "fora do período do plano"} />
        <Cartao rotulo={`Patrimônio no início do usufruto em ${prem.ano_inicio + A}`} valor={`${dinheiroCurto(pessC[A])} a ${dinheiroCurto(otimC[A])}`} />
        <Cartao rotulo={`Retirada mensal bruta ${prem.perpetuo ? `${prem.ano_inicio + A} em diante` : `${prem.ano_inicio + A} a ${prem.ano_inicio + A + (prem.anos_usufruto ?? 0) - 1}`}`} valor={`${brl0(pessMensal)} a ${brl0((otimC[A] * ret) / 12)}`} />
        <Cartao rotulo={`Patrimônio no final do usufruto em ${prem.ano_inicio + T}`} valor={`${dinheiroCurto(Math.max(0, pessC[T]))} a ${dinheiroCurto(Math.max(0, otimC[T]))}`} />
      </div>

      <div className="rounded-lg px-3 py-1.5 text-xs flex flex-wrap items-center gap-x-2"
        style={status.tipo === "abaixo" ? { backgroundColor: "rgba(180,35,24,0.10)", color: VERMELHO }
          : status.tipo === "acima" ? { backgroundColor: "rgba(46,107,63,0.10)", color: "#2E6B3F" }
          : { backgroundColor: "rgba(31,50,71,0.08)", color: "hsl(var(--foreground))" }}>
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
        <section className="rounded-2xl border border-border bg-card p-4 shadow-sm space-y-4">
          <h2 className="text-base font-bold text-foreground" style={{ fontFamily: "Sora, sans-serif" }}>Premissas do plano</h2>

          <Premissa rotulo="Início do plano (ano)" valor={prem.ano_inicio} casas={0} min={anoMinimo} max={anoAtual + 5} passo={1}
            onChange={(v) => set("ano_inicio", Math.min(anoAtual + 5, Math.max(anoMinimo, Math.round(v))))} />
          <Premissa rotulo="Patrimônio inicial" prefixo="R$" valor={prem.patrimonio_inicial} casas={2} min={0}
            max={Math.max(500000, Math.ceil((prem.patrimonio_inicial * 1.5) / 100000) * 100000)} passo={10000}
            onChange={(v) => set("patrimonio_inicial", v)} />
          <Premissa rotulo="Aporte mensal" prefixo="R$" valor={prem.aporte_mensal} casas={2} min={0}
            max={Math.max(30000, Math.ceil((prem.aporte_mensal * 1.5) / 5000) * 5000)} passo={500}
            onChange={(v) => set("aporte_mensal", v)} />
          <Premissa rotulo="Anos de aporte" periodo={`${A > 0 ? `${prem.ano_inicio} a ${prem.ano_inicio + A - 1}` : "sem aportes"}${A !== prem.anos_aporte ? " (revisado)" : ""}`} valor={prem.anos_aporte} casas={0} min={0} max={50} passo={1}
            onChange={(v) => set("anos_aporte", Math.round(v))} />
          <PremissaUsufruto anoInicial={prem.ano_inicio + A} perpetuo={prem.perpetuo} anos={prem.anos_usufruto ?? ultimoPrazo}
            onPrazo={(n) => { setUltimoPrazo(n); setErro(""); setPrem((p) => ({ ...p, perpetuo: false, anos_usufruto: n })); }}
            onPerpetuo={() => { setErro(""); setPrem((p) => ({ ...p, perpetuo: true, anos_usufruto: null })); }} />
          <Premissa rotulo="Retirada anual bruta" sufixo="%" valor={prem.retirada_pct} casas={2} min={1} max={8} passo={0.25}
            onChange={(v) => set("retirada_pct", v)} />
          <Premissa rotulo="Rentab. real pessimista" sufixo="% a.a." valor={prem.rent_pess_pct} casas={2} min={0} max={8} passo={0.5}
            onChange={(v) => set("rent_pess_pct", v)} />
          <Premissa rotulo="Rentab. real otimista" sufixo="% a.a." valor={prem.rent_otim_pct} casas={2} min={1} max={10} passo={0.5}
            onChange={(v) => set("rent_otim_pct", v)} />
          {prem.rent_pess_pct >= prem.rent_otim_pct && (
            <p className="text-[11px]" style={{ color: VERMELHO }}>A pessimista precisa ser menor que a otimista; no gráfico ela é limitada a {pct(rentPessEfetiva(prem.rent_pess_pct, prem.rent_otim_pct), 1)}.</p>
          )}

          <RevisoesPlano key={JSON.stringify(base?.revisoes ?? [])} aviso={avisoRevisoes} salvas={base?.revisoes ?? []} revisoes={revisoes} anoInicio={prem.ano_inicio} fim={fimPlano} anoAtual={anoAtual} disabled={isReadOnly}
            onChange={setRevisoes}
            vigenteAntes={(r) => {
              const antes = { ...prem, revisoes: revisoes.filter((x) => x.ano < r.ano) };
              return { ...parametrosDoAno(antes, r.ano - prem.ano_inicio), fimAporte: prem.ano_inicio + anosAporteEfetivo(antes) - 1 };
            }} />

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
                        Versão {v.versao} · criada em {mesAno(v.criado_em)}
                      </p>
                      <p className="text-[11px] text-muted-foreground leading-snug">{resumoPremissas(v)}</p>
                      {[...(v.revisoes ?? [])].sort((x, y) => x.ano - y.ano).map((r, i) => (
                        <p key={r.ano} className="text-[11px] text-muted-foreground leading-snug mt-0.5">
                          <span className="font-semibold text-foreground">Revisão {i + 1}</span>
                          {r.atualizado_em ?? r.criado_em ? ` · atualizada em ${mesAno((r.atualizado_em ?? r.criado_em) as string)}` : ""} · a partir de {descreverRevisao(r)}
                        </p>
                      ))}
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
                  <span className="inline-block flex-none" style={{ width: 16, height: 3, backgroundColor: "hsl(var(--foreground))" }} />Patrimônio
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="inline-block w-3.5 h-2.5 rounded-sm" style={{ backgroundColor: "rgba(217,58,50,0.10)", border: "1px solid rgba(217,58,50,0.30)" }} />
                  Período de usufruto (com retiradas)
                </span>
              </p>
            </div>
            <TunelChart anoInicio={prem.ano_inicio} anosAporte={A} horizonte={T} pess={pessC} otim={otimC}
              esgota={tunel.pess.esgota} patrimonio={serie} hoje={tHoje > 0 && tHoje <= T ? { t: tHoje, v: patrimonioHoje } : null}
              preservar={prem.perpetuo ? pessC[A] : null}
              revisoes={temposDasRevisoes(prem).map((t) => ({ t, ano: prem.ano_inicio + t }))} />
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
              <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Mostrar no gráfico">
                {([["real", "Real"], ["plano", "Planejado"]] as const).map(([chave, rotulo]) => {
                  const ligado = barrasMostrar[chave];
                  const ultimo = ligado && Object.values(barrasMostrar).filter(Boolean).length === 1; // sempre sobra uma série
                  return (
                    <button key={chave} type="button" aria-pressed={ligado} disabled={ultimo} title={ultimo ? "Pelo menos uma série fica visível" : undefined}
                      onClick={() => setBarrasMostrar((m) => ({ ...m, [chave]: !m[chave] }))}
                      className="px-2.5 py-1 rounded-lg text-xs font-semibold border disabled:cursor-default"
                      style={ligado ? { backgroundColor: `${ACCENT}1a`, borderColor: ACCENT, color: ACCENT } : { borderColor: "hsl(var(--border))", color: "hsl(var(--muted-foreground))" }}>
                      {ligado ? "✓ " : ""}{rotulo}
                    </button>
                  );
                })}
              </div>
            </div>
            <p className="text-xs text-muted-foreground flex flex-wrap gap-x-4 gap-y-1">
              {barrasMostrar.real && (
                <>
                  <span className="flex items-center gap-1.5"><span className="inline-block w-3 h-3 rounded-sm" style={{ backgroundColor: "#10b981" }} />Ganho</span>
                  <span className="flex items-center gap-1.5"><span className="inline-block w-3 h-3 rounded-sm" style={{ backgroundColor: "#A3ACB6" }} />Investido líquido</span>
                </>
              )}
              {barrasMostrar.plano && (
                <>
                  <span className="flex items-center gap-1.5"><span className="inline-block w-3 h-3 rounded-sm" style={{ backgroundColor: "#D3D8DE" }} />Investido planejado</span>
                  <span className="flex items-center gap-1.5"><span className="inline-block w-3 h-3 rounded-sm" style={{ backgroundColor: "#A9E5CF" }} />Ganho planejado (pessimista)</span>
                  <span className="flex items-center gap-1.5"><span className="inline-block w-3 h-3 rounded-sm" style={{ background: "repeating-linear-gradient(45deg, #9ADBC1 0 2px, #DDF5EA 2px 5px)" }} />Até o otimista</span>
                </>
              )}
            </p>
            <BarrasChart barras={barrasGrafico} planejado={planejado} mostrar={barrasMostrar} />
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

// Caixa de número com a unidade dentro (prefixo à esquerda ou sufixo à direita), no lugar do (R$) ou (%) do rótulo
function CaixaComUnidade({ prefixo, sufixo, largura, children }: { prefixo?: string; sufixo?: string; largura: string; children: React.ReactNode }) {
  return (
    <span className={`relative block flex-none ${largura}`}>
      {prefixo && <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground pointer-events-none">{prefixo}</span>}
      {children}
      {sufixo && <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground pointer-events-none whitespace-nowrap">{sufixo}</span>}
    </span>
  );
}
const recuo = (prefixo?: string, sufixo?: string) => `${prefixo ? "pl-8" : ""} ${sufixo ? (sufixo.length > 1 ? "pr-14" : "pr-7") : ""}`;

// Régua que só se mexe quando você arrasta a BOLINHA. Tocar na trilha, ou passar o dedo por cima dela ao rolar a
// página no celular, não muda nada (o <input type="range"> nativo muda o valor em qualquer ponto da barra).
// Na bolinha, arrastar na vertical rola a página (touch-action: pan-y) e arrastar na horizontal mexe no valor.
// Também funciona pelo teclado (setas, Home e End).
function Regua({ min, max, passo, valor, rotulo, onChange }: {
  min: number; max: number; passo: number; valor: number; rotulo: string; onChange: (v: number) => void;
}) {
  const trilha = useRef<HTMLDivElement>(null);
  const arrastando = useRef(false);
  const frac = max > min ? Math.min(1, Math.max(0, (valor - min) / (max - min))) : 0;

  const ajustar = (v: number) => {
    const casas = (String(passo).split(".")[1] ?? "").length;
    const passado = Math.round((v - min) / passo) * passo + min;
    return Math.min(max, Math.max(min, Number(passado.toFixed(casas))));
  };
  const mover = (clientX: number) => {
    const r = trilha.current?.getBoundingClientRect();
    if (!r || r.width <= 0) return;
    const f = Math.min(1, Math.max(0, (clientX - r.left) / r.width));
    const v = ajustar(min + f * (max - min));
    if (v !== valor) onChange(v);
  };

  return (
    <div ref={trilha} className="relative h-6 mt-1.5 mb-0.5 select-none">
      {/* trilha e parte preenchida: só desenho, não recebem toque */}
      <div className="absolute left-0 right-0 top-1/2 -translate-y-1/2 h-1 rounded-full bg-secondary pointer-events-none" />
      <div className="absolute left-0 top-1/2 -translate-y-1/2 h-1 rounded-full pointer-events-none" style={{ width: `${frac * 100}%`, backgroundColor: ACCENT }} />
      <div role="slider" tabIndex={0} aria-label={rotulo} aria-valuemin={min} aria-valuemax={max} aria-valuenow={valor}
        className="absolute top-1/2 w-7 h-7 -translate-x-1/2 -translate-y-1/2 flex items-center justify-center cursor-grab active:cursor-grabbing outline-none group/bolinha"
        style={{ left: `${frac * 100}%`, touchAction: "pan-y" }}
        onPointerDown={(e) => { arrastando.current = true; e.currentTarget.setPointerCapture(e.pointerId); }}
        onPointerMove={(e) => { if (arrastando.current) mover(e.clientX); }}
        onPointerUp={() => { arrastando.current = false; }}
        onPointerCancel={() => { arrastando.current = false; }}
        onKeyDown={(e) => {
          const passoTecla = e.key === "ArrowRight" || e.key === "ArrowUp" ? passo : e.key === "ArrowLeft" || e.key === "ArrowDown" ? -passo : 0;
          if (passoTecla) { e.preventDefault(); onChange(ajustar(valor + passoTecla)); }
          else if (e.key === "Home") { e.preventDefault(); onChange(min); }
          else if (e.key === "End") { e.preventDefault(); onChange(max); }
        }}>
        <span className="block w-4 h-4 rounded-full border-2 border-white shadow group-focus-visible/bolinha:ring-2 group-focus-visible/bolinha:ring-offset-1" style={{ backgroundColor: ACCENT }} />
      </div>
    </div>
  );
}

function Premissa({
  rotulo, periodo, prefixo, sufixo, valor, casas, min, max, passo, onChange,
}: {
  rotulo: string; periodo?: string; prefixo?: string; sufixo?: string; valor: number; casas: number; min: number; max: number; passo: number; onChange: (v: number) => void;
}) {
  return (
    <div>
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-semibold text-muted-foreground leading-tight">
          {rotulo}
          {periodo && <span className="block text-[11px] font-medium tabular-nums">{periodo}</span>}
        </span>
        <CaixaComUnidade prefixo={prefixo} sufixo={sufixo} largura="w-[5.5rem]">
          <DecimalInput value={valor} casas={casas} ariaLabel={rotulo} className={`${inputCls} h-6 w-full py-0 text-xs ${recuo(prefixo, sufixo)}`} onValue={(v) => onChange(v ?? 0)} />
        </CaixaComUnidade>
      </div>
      <Regua min={min} max={Math.max(max, valor)} passo={passo} valor={Math.min(Math.max(valor, min), Math.max(max, valor))} rotulo={rotulo} onChange={onChange} />
    </div>
  );
}

// Revisões do plano: a partir do início de um ano, os campos preenchidos passam a valer (os vazios continuam como estavam)
function RevisoesPlano({
  revisoes, anoInicio, fim, anoAtual, disabled, onChange, vigenteAntes, aviso, salvas,
}: {
  aviso: string | null;
  salvas: Revisao[];
  revisoes: Revisao[]; anoInicio: number; fim: number; anoAtual: number; disabled: boolean;
  onChange: (lista: Revisao[]) => void;
  vigenteAntes: (r: Revisao) => { aporte: number; pess: number; otim: number; retirada: number; fimAporte: number };
}) {
  // Revisões já salvas aparecem como uma linha (ano e o que muda): para mudá-las é preciso clicar em Editar.
  // Assim, "adicionar" uma revisão nunca sobrescreve uma que já existe.
  const [editando, setEditando] = useState<number[]>([]);
  // Fechar recolhe o cartão numa linha, mesmo com mudanças ainda não salvas (elas continuam valendo na tela)
  const [fechadas, setFechadas] = useState<number[]>([]);
  const [excluindo, setExcluindo] = useState<number | null>(null); // ano da revisão à espera de confirmação
  const excluir = (ano: number) => {
    onChange(revisoes.filter((x) => x.ano !== ano));
    setFechadas((c) => c.filter((a) => a !== ano));
    setEditando((e) => e.filter((a) => a !== ano));
    setExcluindo(null);
  };
  const salvaIgual = (r: Revisao) => {
    const s = salvas.find((x) => x.ano === r.ano);
    return !!s && JSON.stringify(s) === JSON.stringify(r);
  };
  const atualizar = (i: number, parte: Partial<Revisao>) => onChange(revisoes.map((r, j) => (j === i ? { ...r, ...parte } : r)));
  const adicionar = () => {
    const usados = new Set(revisoes.map((r) => r.ano));
    let ano = Math.min(fim, Math.max(anoInicio + 1, anoAtual + 1));
    while (usados.has(ano) && ano < fim) ano++;
    onChange([...revisoes, { ano, aporte_mensal: null, rent_pess_pct: null, rent_otim_pct: null, retirada_pct: null, fim_aporte: null }]);
  };
  const campos: { k: "aporte_mensal" | "retirada_pct" | "rent_pess_pct" | "rent_otim_pct"; rotulo: string; casas: number; vigente: "aporte" | "retirada" | "pess" | "otim"; prefixo?: string; sufixo?: string }[] = [
    { k: "aporte_mensal", rotulo: "Aporte mensal", casas: 2, vigente: "aporte", prefixo: "R$" },
    { k: "retirada_pct", rotulo: "Retirada anual", casas: 2, vigente: "retirada", sufixo: "%" },
    { k: "rent_pess_pct", rotulo: "Rent. pessimista", casas: 2, vigente: "pess", sufixo: "%" },
    { k: "rent_otim_pct", rotulo: "Rent. otimista", casas: 2, vigente: "otim", sufixo: "%" },
  ];
  return (
    <details className="group rounded-xl border border-border">
      <summary className="px-3.5 py-3 cursor-pointer flex items-center gap-2 list-none [&::-webkit-details-marker]:hidden">
        <ChevronDown className="h-3.5 w-3.5 text-muted-foreground transition-transform -rotate-90 group-open:rotate-0" aria-hidden />
        <span className="text-xs font-semibold uppercase tracking-wide text-foreground">Revisões do plano</span>
        {revisoes.length > 0 && <span className="text-[11px] text-muted-foreground">{revisoes.length}</span>}
      </summary>
      <div className="px-3.5 pb-3.5 space-y-2.5 border-t border-border pt-3">
        <p className="text-[11px] text-muted-foreground">
          Mude aporte, retirada, rentabilidades ou o último ano de aporte só a partir de um ano. O que ficar em branco continua como está.
        </p>
        {revisoes.map((r, i) => {
          const antes = vigenteAntes(r);
          if (fechadas.includes(r.ano) || (salvaIgual(r) && !editando.includes(r.ano))) {
            return (
              <div key={i} className="flex items-center justify-between gap-2 rounded-xl border border-border px-2.5 py-2">
                <p className="text-xs text-foreground leading-snug min-w-0">
                  <span className="font-semibold">A partir de {r.ano}:</span> {descreverRevisao(r).replace(/^\d+: /, "")}
                  {!salvaIgual(r) && <span className="font-semibold" style={{ color: "#8A5A00" }}> · salve o plano para aplicar</span>}
                </p>
                {!disabled && (
                  <span className="flex items-center gap-1 flex-none">
                    <button type="button" onClick={() => { setFechadas((c) => c.filter((a) => a !== r.ano)); setEditando((e) => (e.includes(r.ano) ? e : [...e, r.ano])); }}
                      className="text-[11px] font-semibold px-1.5 py-0.5 rounded-md hover:bg-secondary/50" style={{ color: ACCENT }}>Editar</button>
                    <button type="button" aria-label={`Excluir a revisão de ${r.ano}`} onClick={() => setExcluindo(r.ano)}
                      className="text-[11px] font-semibold px-1.5 py-0.5 rounded-md hover:bg-secondary/50" style={{ color: VERMELHO }}>Excluir</button>
                  </span>
                )}
              </div>
            );
          }
          // Estado do cartão: nova (ainda não salva), em edição (salva, sem mudanças) ou alterada (falta salvar o plano)
          const salvaDoAno = salvas.find((x) => x.ano === r.ano);
          const estado = !salvaDoAno ? "nova" : salvaIgual(r) ? "editando" : "alterada";
          // o número segue a ordem dos anos, o mesmo "Revisão N" do cabeçalho do plano
          const numero = [...revisoes].sort((x, y) => x.ano - y.ano).findIndex((x) => x === r) + 1;
          const rotuloEstado = { nova: `Revisão ${numero}: salve o plano para aplicar`, editando: "Editando esta revisão", alterada: `Revisão ${numero}: salve o plano para aplicar` }[estado];
          return (
            <div key={i} className="rounded-xl border p-2.5 space-y-2" style={{ borderColor: estado === "alterada" ? "#8A5A00" : ACCENT }}>
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] font-bold" style={{ color: estado === "alterada" ? "#8A5A00" : ACCENT }}>{rotuloEstado}</span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <label className="flex items-center gap-2 text-[11px] font-semibold text-muted-foreground">
                  A partir de
                  <DecimalInput value={r.ano} casas={0} disabled={disabled || salvas.some((x) => x.ano === r.ano)} ariaLabel="Ano da revisão" className={`${inputCls} h-8 w-20 py-0 text-xs`}
                    onValue={(v) => atualizar(i, { ano: Math.round(v ?? r.ano) })} />
                </label>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {campos.map((c) => (
                  <label key={c.k} className="block min-w-0">
                    <span className="block text-[11px] font-semibold text-muted-foreground mb-1 truncate" title={c.rotulo}>{c.rotulo}</span>
                    <CaixaComUnidade prefixo={c.prefixo} sufixo={c.sufixo} largura="w-full">
                      <DecimalInput value={r[c.k]} casas={c.casas} disabled={disabled} ariaLabel={`${c.rotulo} a partir de ${r.ano}`}
                        placeholder={fmtNum(antes[c.vigente], 0, 2)} className={`${inputCls} h-8 py-0 text-xs ${recuo(c.prefixo, c.sufixo)}`}
                        onValue={(v) => atualizar(i, { [c.k]: v } as Partial<Revisao>)} />
                    </CaixaComUnidade>
                  </label>
                ))}
                <label className="block min-w-0 col-span-2">
                  <span className="block text-[11px] font-semibold text-muted-foreground mb-1">Aportar até o ano (muda o início do usufruto)</span>
                  <DecimalInput value={r.fim_aporte} casas={0} disabled={disabled} ariaLabel={`Último ano de aporte a partir de ${r.ano}`}
                    placeholder={String(antes.fimAporte)} className={`${inputCls} h-8 py-0 text-xs`}
                    onValue={(v) => atualizar(i, { fim_aporte: v == null ? null : Math.round(v) })} />
                </label>
              </div>
              {!disabled && (
                <div className="flex items-center justify-end gap-1 pt-1 border-t border-border">
                  <button type="button" className="text-[11px] font-semibold px-2 py-1 rounded-md hover:bg-secondary/50" style={{ color: ACCENT }}
                    onClick={() => { setEditando((e) => e.filter((a) => a !== r.ano)); setFechadas((c) => (c.includes(r.ano) ? c : [...c, r.ano])); }}>
                    Fechar
                  </button>
                  <button type="button" className="text-[11px] font-semibold px-2 py-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary/50"
                    onClick={() => {
                      // salva: volta aos valores salvos; nova: esvazia os campos (o ano fica)
                      const vazia: Revisao = { ano: r.ano, aporte_mensal: null, rent_pess_pct: null, rent_otim_pct: null, retirada_pct: null, fim_aporte: null };
                      onChange(revisoes.map((x, j) => (j === i ? (salvaDoAno ?? vazia) : x)));
                      setEditando((e) => e.filter((a) => a !== r.ano));
                    }}>
                    Limpar
                  </button>
                  <button type="button" aria-label={`Excluir a revisão de ${r.ano}`} className="text-[11px] font-semibold px-2 py-1 rounded-md hover:bg-secondary/50"
                    style={{ color: VERMELHO }} onClick={() => setExcluindo(r.ano)}>
                    Excluir
                  </button>
                </div>
              )}
            </div>
          );
        })}
        {excluindo != null && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setExcluindo(null)}>
            <div role="dialog" aria-modal="true" aria-label="Confirmar exclusão da revisão"
              className="w-full max-w-sm rounded-2xl border border-border bg-card p-5 shadow-xl space-y-3" onClick={(e) => e.stopPropagation()}>
              <h3 className="text-base font-bold text-foreground" style={{ fontFamily: "Sora, sans-serif" }}>Excluir a revisão de {excluindo}?</h3>
              <p className="text-sm text-muted-foreground">
                A revisão sai da lista agora e deixa de valer no plano quando você salvar. Para manter a anterior no histórico, salve o plano como uma nova versão.
              </p>
              <div className="flex justify-end gap-2">
                <button type="button" onClick={() => setExcluindo(null)}
                  className="px-4 py-2 rounded-lg text-sm font-semibold border border-border hover:bg-secondary/50">Cancelar</button>
                <button type="button" onClick={() => excluir(excluindo)}
                  className="px-4 py-2 rounded-lg text-sm font-semibold text-white" style={{ backgroundColor: VERMELHO }}>Excluir</button>
              </div>
            </div>
          </div>
        )}
        {aviso && <p className="text-[11px] font-medium" style={{ color: VERMELHO }}>{aviso}</p>}
        {!disabled && (
          <button type="button" onClick={adicionar}
            className="w-full py-1.5 rounded-lg text-xs font-semibold border border-dashed border-border hover:bg-secondary/40 flex items-center justify-center gap-1.5" style={{ color: ACCENT }}>
            <Plus className="h-3.5 w-3.5" />Adicionar revisão
          </button>
        )}
      </div>
    </details>
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
    <div>
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-semibold text-muted-foreground leading-tight">
          Anos de usufruto
          <span className="block text-[11px] font-medium tabular-nums">{perpetuo ? `${anoInicial} em diante` : `${anoInicial} a ${anoInicial + anos - 1}`}</span>
        </span>
        <span className="flex items-center gap-1">
          {perpetuo ? (
            <span className={`${inputCls} h-6 w-[5.5rem] py-0 text-xs flex items-center justify-end text-muted-foreground`}>perpétuo</span>
          ) : (
            <DecimalInput value={anos} casas={0} ariaLabel="Anos de usufruto" className={`${inputCls} h-6 w-[5.5rem] py-0 text-xs`}
              onValue={(v) => onPrazo(Math.max(1, Math.round(v ?? 1)))} />
          )}
          <button type="button" aria-pressed={perpetuo} title="Usufruto perpétuo (infinito)"
            onClick={() => (perpetuo ? onPrazo(anos) : onPerpetuo())}
            className="h-6 w-7 rounded-lg border text-sm font-bold leading-none transition-colors"
            style={perpetuo ? { backgroundColor: ACCENT, borderColor: ACCENT, color: "#fff" } : { borderColor: "hsl(var(--border))", color: "hsl(var(--muted-foreground))" }}>
            ∞
          </button>
        </span>
      </div>
      <Regua min={1} max={MAX_ANOS_USUFRUTO + 1} passo={1} rotulo="Anos de usufruto (o fim da escala é o infinito)"
        valor={perpetuo ? MAX_ANOS_USUFRUTO + 1 : Math.min(Math.max(anos, 1), MAX_ANOS_USUFRUTO)}
        onChange={(v) => { if (v > MAX_ANOS_USUFRUTO) onPerpetuo(); else onPrazo(v); }} />
      <div className="flex justify-between text-[10px] leading-none text-muted-foreground"><span>1 ano</span><span>{MAX_ANOS_USUFRUTO} anos</span><span>∞</span></div>
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
