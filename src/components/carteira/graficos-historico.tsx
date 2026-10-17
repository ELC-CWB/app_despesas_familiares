"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import { fmtNum } from "@/lib/carteira/numeros";
import { inicioDoPeriodo, marcasDoEixo, periodoCabe, rebase, rebaseComum, type Periodo } from "@/lib/carteira/historico";
import type { RespostaHistorico } from "@/lib/carteira/historico-dados";
import { ACCENT } from "@/components/carteira/campos";

// Visão geral: dois gráficos de linha, acumulados. (1) a carteira contra CDI, Ibovespa e S&P 500; (2) cada ativo.
// Os dados chegam como níveis (índice acumulado) e a tela refaz a base conforme o período escolhido.

const PERIODOS: { id: Periodo; rotulo: string }[] = [
  { id: "ano", rotulo: "No ano" }, { id: "6m", rotulo: "6 meses" }, { id: "12m", rotulo: "12 meses" }, { id: "24m", rotulo: "24 meses" },
  { id: "36m", rotulo: "3 anos" }, { id: "60m", rotulo: "5 anos" }, { id: "120m", rotulo: "10 anos" }, { id: "tudo", rotulo: "Desde o início" },
];

const COR_CARTEIRA = "#1F3247";
const COR_CDI = "#D97706";
const COR_IBOV = "#16A34A";
const COR_SP = "#7C3AED";
// cores bem distintas para os ativos (a ordem segue a da carteira)
const PALETA = ["#2563EB", "#DC2626", "#059669", "#D97706", "#7C3AED", "#DB2777", "#0891B2", "#65A30D", "#9333EA", "#EA580C", "#475569", "#0D9488"];

const pct = (v: number | null | undefined) => (v == null ? "—" : `${v > 0 ? "+" : ""}${fmtNum(v, 1, 1)}%`);
const dataBr = (iso: string) => iso.split("-").reverse().join("/");

type Linha = { id: string; nome: string; cor: string; valores: (number | null)[]; grossa?: boolean };
type Grupo = { rotulo: string; ids: string[] };

export function GraficosHistorico() {
  const [estado, setEstado] = useState<"carregando" | "ok" | "erro">("carregando");
  const [dados, setDados] = useState<RespostaHistorico | null>(null);
  const [erro, setErro] = useState("");
  const [periodo, setPeriodo] = useState<Periodo>("12m");
  const [mostrar, setMostrar] = useState({ indicadores: true, ativos: true }); // gráficos visíveis

  const [tentativa, setTentativa] = useState(0);

  // Busca ao abrir a tela (e de novo se o usuário pedir): o setState só acontece quando a resposta chega
  useEffect(() => {
    let vivo = true;
    fetch("/api/carteira/historico")
      .then(async (res) => {
        const json = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(json.error ?? "Erro ao carregar o histórico");
        if (vivo) { setDados(json as RespostaHistorico); setEstado("ok"); }
      })
      .catch((e) => {
        if (vivo) { setErro(e instanceof Error ? e.message : "Erro ao carregar o histórico"); setEstado("erro"); }
      });
    return () => { vivo = false; };
  }, [tentativa]);

  const hojeDados = dados?.datas.length ? dados.datas[dados.datas.length - 1] : null;
  // Períodos maiores que o histórico da CARTEIRA continuam disponíveis: aí o gráfico mostra só os indicadores.
  // Ficam desabilitados só os que passam dos dados que temos (~10 anos).
  const primeiraDados = dados?.datas[0] ?? null;
  const cabe = useCallback(
    (id: Periodo) => (hojeDados && primeiraDados ? periodoCabe(id, hojeDados, primeiraDados) : id === "tudo"),
    [primeiraDados, hojeDados],
  );
  const periodoAtivo: Periodo = cabe(periodo) ? periodo : "tudo";

  const grafico = useMemo(() => {
    if (!dados || !dados.datas.length || !dados.inicio) return null;
    const hoje = dados.datas[dados.datas.length - 1];
    // "Desde o início" é o início da CARTEIRA; os demais períodos podem ir além dela (só indicadores)
    const inicio = periodoAtivo === "tudo" ? dados.inicio : inicioDoPeriodo(periodoAtivo, hoje, dados.datas[0]);
    // período que começa antes da carteira: só os indicadores (sem linha da carteira), ancorados no Ibovespa
    const semCarteira = inicio < dados.inicio;
    const nulos = dados.datas.map(() => null);
    const c1 = rebaseComum(dados.datas, [semCarteira ? nulos : dados.carteira, dados.cdi, dados.ibov, dados.sp500], inicio, semCarteira ? dados.ibov : dados.carteira);
    const linhas1: Linha[] = [
      { id: "carteira", nome: "Carteira", cor: COR_CARTEIRA, valores: c1.series[0], grossa: true },
      { id: "cdi", nome: "CDI", cor: COR_CDI, valores: c1.series[1] },
      { id: "ibov", nome: "Ibovespa", cor: COR_IBOV, valores: c1.series[2] },
      { id: "sp", nome: "S&P 500 (em R$)", cor: COR_SP, valores: c1.series[3] },
    ];
    // ativos: a linha de cada um nasce na primeira compra dentro do período
    const niveis = dados.ativos.map((a) => a.serie.map((v, i) => (dados.datas[i] < (a.desde ?? "") ? null : v)));
    const c2 = semCarteira ? { datas: [] as string[], series: niveis.map(() => [] as (number | null)[]) } : rebase(dados.datas, niveis, inicio);
    const linhas2: Linha[] = dados.ativos.map((a, i) => ({ id: a.id, nome: a.codigo, cor: PALETA[i % PALETA.length], valores: c2.series[i] }));
    const doMercado = (m: "brasil" | "exterior") => dados.ativos.filter((a) => a.mercado === m).map((a) => a.id);
    const grupos2: Grupo[] = [
      { rotulo: "Só Brasil", ids: doMercado("brasil") },
      { rotulo: "Só exterior", ids: doMercado("exterior") },
    ].filter((g) => g.ids.length > 0);
    const grupos1: Grupo[] = [{ rotulo: "Só a carteira", ids: ["carteira"] }, { rotulo: "Só indicadores", ids: ["cdi", "ibov", "sp"] }];
    return { inicio, semCarteira, inicioCarteira: dados.inicio, datas1: c1.datas, linhas1, grupos1, datas2: c2.datas, linhas2, grupos2 };
  }, [dados, periodoAtivo]);

  if (estado === "carregando") {
    return (
      <div className="rounded-2xl border border-border bg-card p-6 shadow-sm flex items-center justify-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />Carregando o histórico de preços…
      </div>
    );
  }
  if (estado === "erro") {
    return (
      <div className="rounded-2xl border border-border bg-card p-4 shadow-sm text-sm flex flex-wrap items-center gap-3">
        <span style={{ color: "#B42318" }}>{erro}</span>
        <button type="button" onClick={() => { setEstado("carregando"); setTentativa((n) => n + 1); }} className="font-semibold underline" style={{ color: ACCENT }}>Tentar de novo</button>
      </div>
    );
  }
  if (!grafico) {
    return (
      <div className="rounded-2xl border border-border bg-card p-4 shadow-sm text-sm text-muted-foreground">
        Os gráficos de rentabilidade aparecem depois que houver movimentações registradas e histórico de preços.
        {dados?.avisos.map((a, i) => <span key={i} className="block mt-1">{a}</span>)}
      </div>
    );
  }

  return (
    <section className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-base font-bold text-foreground" style={{ fontFamily: "Sora, sans-serif" }}>Rentabilidade acumulada</h2>
        <div className="flex flex-wrap gap-1" role="group" aria-label="Período">
          {PERIODOS.map((p) => (
            <button key={p.id} type="button" aria-pressed={periodoAtivo === p.id} disabled={!cabe(p.id)} onClick={() => setPeriodo(p.id)}
              title={cabe(p.id) ? undefined : "Sem dados de mercado tão antigos"}
              className="px-2.5 py-1 rounded-lg text-xs font-semibold border disabled:opacity-40 disabled:cursor-not-allowed"
              style={periodoAtivo === p.id ? { backgroundColor: ACCENT, borderColor: ACCENT, color: "#fff" } : { borderColor: "hsl(var(--border))", color: "hsl(var(--muted-foreground))" }}>
              {p.rotulo}
            </button>
          ))}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Gráficos visíveis">
        <span className="text-xs font-semibold text-muted-foreground mr-1">Gráficos</span>
        {([["indicadores", "Carteira x indicadores"], ["ativos", "Evolução dos ativos"]] as const).map(([chave, rotulo]) => {
          const ligado = mostrar[chave];
          const ultimo = ligado && Object.values(mostrar).filter(Boolean).length === 1; // sempre sobra um gráfico na tela
          return (
            <button key={chave} type="button" aria-pressed={ligado} disabled={ultimo} title={ultimo ? "Pelo menos um gráfico fica visível" : ligado ? "Esconder este gráfico" : "Mostrar este gráfico"}
              onClick={() => setMostrar((m) => ({ ...m, [chave]: !m[chave] }))}
              className="px-2.5 py-1 rounded-lg text-xs font-semibold border disabled:cursor-default"
              style={ligado ? { backgroundColor: `${ACCENT}1a`, borderColor: ACCENT, color: ACCENT } : { borderColor: "hsl(var(--border))", color: "hsl(var(--muted-foreground))" }}>
              {ligado ? "✓ " : ""}{rotulo}
            </button>
          );
        })}
      </div>
      <div className={`grid grid-cols-1 gap-3 ${mostrar.indicadores && mostrar.ativos ? "xl:grid-cols-2" : ""}`}>
        {mostrar.indicadores && (
          <Cartao titulo="Carteira x indicadores" sub={grafico.semCarteira ? `desde ${dataBr(grafico.datas1[0] ?? grafico.inicio)}: só indicadores (a carteira começou em ${dataBr(grafico.inicioCarteira)})` : `desde ${dataBr(grafico.datas1[0] ?? grafico.inicio)}`}>
            <GraficoLinhas datas={grafico.datas1} linhas={grafico.linhas1} grupos={grafico.grupos1} />
          </Cartao>
        )}
        {mostrar.ativos && (
          <Cartao titulo="Evolução de cada ativo" sub={grafico.semCarteira ? "sem dados neste período" : "retorno do preço em R$, desde a 1ª compra dentro do período"}>
            <GraficoLinhas datas={grafico.datas2} linhas={grafico.linhas2} grupos={grafico.grupos2}
              vazio={grafico.semCarteira ? `A carteira ainda não existia neste período: ela começou em ${dataBr(grafico.inicioCarteira)}.` : undefined} />
          </Cartao>
        )}
      </div>
      <p className="text-[11px] text-muted-foreground leading-snug">
        A carteira é a rentabilidade encadeada dia a dia, sem o efeito de aportes e retiradas, com proventos como ganho.
        O S&amp;P 500 está convertido para reais. Rentabilidade passada não garante resultado futuro.
        {dados?.avisos.map((a, i) => (
          <span key={i} className="block" style={{ color: "#8A5A00" }}>
            {a}
            {/indispon/.test(a) && (
              <button type="button" className="ml-2 font-semibold underline" onClick={() => { setEstado("carregando"); setTentativa((n) => n + 1); }}>Tentar de novo</button>
            )}
          </span>
        ))}
      </p>
    </section>
  );
}

function Cartao({ titulo, sub, children }: { titulo: string; sub: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-3 sm:p-4 shadow-sm space-y-2 min-w-0">
      <div>
        <h3 className="text-sm font-bold text-foreground">{titulo}</h3>
        <p className="text-[11px] text-muted-foreground">{sub}</p>
      </div>
      {children}
    </div>
  );
}

const W = 640, H = 280, X0 = 46, X1 = 628, Y0 = 12, Y1 = 250;

function GraficoLinhas({ datas, linhas, grupos = [], vazio }: { datas: string[]; linhas: Linha[]; grupos?: Grupo[]; vazio?: string }) {
  const [ocultas, setOcultas] = useState<string[]>([]);
  const [hover, setHover] = useState<number | null>(null);
  const visiveis = useMemo(() => linhas.filter((l) => !ocultas.includes(l.id)), [linhas, ocultas]);

  const { min, max } = useMemo(() => {
    const vs = visiveis.flatMap((l) => l.valores.filter((v): v is number => v != null));
    if (!vs.length) return { min: -1, max: 1 };
    return { min: Math.min(0, ...vs), max: Math.max(0, ...vs) };
  }, [visiveis]);
  const marcas = useMemo(() => marcasDoEixo(min, max), [min, max]);
  const lo = Math.min(min, marcas[0] ?? min), hi = Math.max(max, marcas.at(-1) ?? max);

  if (datas.length < 2) return <p className="text-sm text-muted-foreground py-16 text-center">{vazio ?? "Sem dados suficientes neste período."}</p>;

  const t0 = Date.parse(datas[0]), t1 = Date.parse(datas[datas.length - 1]);
  const X = (i: number) => X0 + ((Date.parse(datas[i]) - t0) / Math.max(1, t1 - t0)) * (X1 - X0);
  const Y = (v: number) => Y1 - ((v - lo) / Math.max(1e-9, hi - lo)) * (Y1 - Y0);
  const r1 = (v: number) => Math.round(v * 10) / 10;

  const caminho = (valores: (number | null)[]) => {
    let d = "";
    let aberto = false;
    valores.forEach((v, i) => {
      if (v == null) { aberto = false; return; }
      d += `${aberto ? "L" : "M"}${r1(X(i))},${r1(Y(v))}`;
      aberto = true;
    });
    return d;
  };

  // rótulos do eixo horizontal: ~5 datas, em mês/ano
  const nRot = 5;
  const rotulos = Array.from({ length: nRot }, (_, k) => {
    const alvo = t0 + ((t1 - t0) * k) / (nRot - 1);
    let i = 0;
    while (i < datas.length - 1 && Date.parse(datas[i]) < alvo) i++;
    const [y, m] = datas[i].split("-");
    return { i, texto: `${m}/${y.slice(2)}` };
  });

  const mover = (e: React.MouseEvent<SVGRectElement>) => {
    const caixa = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - caixa.left) / caixa.width) * (X1 - X0) + X0;
    const alvo = t0 + ((x - X0) / (X1 - X0)) * (t1 - t0);
    let melhor = 0;
    let dist = Infinity;
    datas.forEach((d, i) => { const dd = Math.abs(Date.parse(d) - alvo); if (dd < dist) { dist = dd; melhor = i; } });
    setHover(melhor);
  };
  const ultimo = (l: Linha) => [...l.valores].reverse().find((v) => v != null) ?? null;
  const pos = hover != null ? ((X(hover) / W) * 100) : 0;

  return (
    <div className="space-y-2">
      <div className="relative">
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto block" role="img" aria-label="Gráfico de linhas de rentabilidade acumulada">
          {marcas.map((v) => (
            <g key={v}>
              <line x1={X0} x2={X1} y1={r1(Y(v))} y2={r1(Y(v))} style={{ stroke: "hsl(var(--border))" }} strokeWidth={v === 0 ? 1.5 : 1} />
              <text x={X0 - 6} y={r1(Y(v))} dy="0.35em" textAnchor="end" fontSize={10.5} className="fill-muted-foreground">{fmtNum(v, 0, 1)}%</text>
            </g>
          ))}
          {rotulos.map((r) => (
            <text key={r.i} x={r1(X(r.i))} y={Y1 + 18} textAnchor={r.i === 0 ? "start" : r.i === datas.length - 1 ? "end" : "middle"} fontSize={10.5} className="fill-muted-foreground">{r.texto}</text>
          ))}
          {visiveis.map((l) => (
            <path key={l.id} d={caminho(l.valores)} fill="none" stroke={l.cor} strokeWidth={l.grossa ? 2.6 : 1.6} strokeLinejoin="round" strokeLinecap="round" />
          ))}
          {hover != null && (
            <g pointerEvents="none">
              <line x1={r1(X(hover))} x2={r1(X(hover))} y1={Y0} y2={Y1} style={{ stroke: "hsl(var(--muted-foreground))" }} strokeWidth={1} strokeDasharray="3 3" />
              {visiveis.map((l) => (l.valores[hover] == null ? null : (
                <circle key={l.id} cx={r1(X(hover))} cy={r1(Y(l.valores[hover] as number))} r={3.5} fill={l.cor} style={{ stroke: "hsl(var(--card))" }} strokeWidth={1.5} />
              )))}
            </g>
          )}
          <rect x={X0} y={Y0} width={X1 - X0} height={Y1 - Y0} fill="transparent" onMouseMove={mover} onMouseLeave={() => setHover(null)} />
        </svg>
        {hover != null && (
          <div className="absolute top-1 z-10 pointer-events-none rounded-lg border border-border bg-popover px-2.5 py-1.5 shadow-md text-[11px] leading-snug min-w-[9rem]"
            style={pos > 55 ? { right: `${100 - pos + 2}%` } : { left: `${pos + 2}%` }}>
            <p className="font-bold text-foreground mb-0.5">{dataBr(datas[hover])}</p>
            {[...visiveis].sort((a, b) => (b.valores[hover] ?? -1e9) - (a.valores[hover] ?? -1e9)).map((l) => (
              <p key={l.id} className="flex items-center justify-between gap-3">
                <span className="flex items-center gap-1.5"><span className="inline-block w-2 h-2 rounded-full" style={{ backgroundColor: l.cor }} />{l.nome}</span>
                <span className="font-semibold tabular-nums">{pct(l.valores[hover])}</span>
              </p>
            ))}
          </div>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        {linhas.map((l) => {
          const oculta = ocultas.includes(l.id);
          return (
            <button key={l.id} type="button" aria-pressed={!oculta} title={oculta ? "Mostrar a linha" : "Ocultar a linha"}
              onClick={() => setOcultas((o) => (oculta ? o.filter((x) => x !== l.id) : [...o, l.id]))}
              className="flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-semibold"
              style={oculta ? { borderColor: "hsl(var(--border))", opacity: 0.55 } : { borderColor: l.cor, backgroundColor: `${l.cor}14` }}>
              <span className="inline-block rounded-full" style={{ width: 8, height: 8, backgroundColor: oculta ? "transparent" : l.cor, border: `1.5px solid ${l.cor}` }} />
              <span className={oculta ? "text-muted-foreground line-through" : "text-foreground"}>{l.nome}</span>
              {!oculta && <span className="tabular-nums text-muted-foreground font-medium">{pct(ultimo(l))}</span>}
            </button>
          );
        })}
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] font-semibold">
        <button type="button" className="underline-offset-2 hover:underline" style={{ color: ACCENT }} onClick={() => setOcultas([])}>Todos</button>
        <button type="button" className="underline-offset-2 hover:underline" style={{ color: ACCENT }} onClick={() => setOcultas(linhas.map((l) => l.id))}>Nenhum</button>
        {grupos.map((g) => (
          <button key={g.rotulo} type="button" className="underline-offset-2 hover:underline" style={{ color: ACCENT }}
            onClick={() => setOcultas(linhas.filter((l) => !g.ids.includes(l.id)).map((l) => l.id))}>{g.rotulo}</button>
        ))}
      </div>
    </div>
  );
}
