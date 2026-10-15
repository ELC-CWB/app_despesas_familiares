"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, Filter, Loader2, X } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { fmtBRL, fmtNum } from "@/lib/carteira/numeros";
import type { Ativo, Corretora } from "@/lib/carteira/tipos";
import type { MovCompleta } from "@/components/carteira/movimentacoes-client";
import { ACCENT, inputCls, VERMELHO } from "@/components/carteira/campos";

// Histórico de movimentações (SPEC §4.4): filtros no título das colunas, modal de detalhes
// com observações editáveis e totais do período.

const VERDE = "#2E6B3F";
const AZUL = "#1A4A82";
const OPERACAO = { compra: "Compra", venda: "Venda", provento: "Provento" } as const;
const COR_OP = { compra: VERDE, venda: VERMELHO, provento: AZUL } as const;
const PROVENTO = { dividendo: "Dividendo", jcp: "JCP", rendimento: "Rendimento" } as const;

const fmtData = (iso: string) => { const [y, m, d] = iso.split("-"); return `${d}/${m}/${y}`; };
const fmtDataCurta = (iso: string) => { const [y, m, d] = iso.split("-"); return `${d}/${m}/${y.slice(2)}`; };

// Valor bruto em R$ (compra e venda no exterior ficam guardadas na moeda do ativo)
const brutoBRL = (m: MovCompleta) => (m.moeda === "BRL" ? m.valor_bruto : m.valor_bruto * (m.cambio_usado ?? 0));
const taxasDe = (m: MovCompleta) =>
  m.spread_valor + m.iof_valor + m.corretagem + m.emolumentos + m.outras_taxas + (m.tipo === "venda" ? m.ir_estimado ?? m.ir_retido : m.ir_retido);

type Filtro = "data" | "ativo" | "op" | "corretora" | null;

export function HistoricoMovimentacoes({
  movs, ativos, corretoras, isReadOnly,
}: {
  movs: MovCompleta[]; ativos: Ativo[]; corretoras: Corretora[]; isReadOnly: boolean;
}) {
  const [de, setDe] = useState("");
  const [ate, setAte] = useState("");
  const [ativoF, setAtivoF] = useState("todos");
  const [opF, setOpF] = useState<"todos" | MovCompleta["tipo"]>("todos");
  const [corrF, setCorrF] = useState("todos");
  const [aberto, setAberto] = useState<Filtro>(null);
  const [recolhido, setRecolhido] = useState(false);
  const [selecionada, setSelecionada] = useState<string | null>(null);

  const codigo = (id: string) => ativos.find((a) => a.id === id)?.codigo ?? "—";
  const nomeCorretora = (id: string | null) => (id ? corretoras.find((c) => c.id === id)?.nome ?? "—" : "—");

  const filtradas = movs.filter((m) =>
    (!de || m.data >= de) && (!ate || m.data <= ate)
    && (ativoF === "todos" || m.ativo_id === ativoF)
    && (opF === "todos" || m.tipo === opF)
    && (corrF === "todos" || m.corretora_id === corrF));

  const soma = (t: MovCompleta["tipo"], campo: (m: MovCompleta) => number) => {
    const l = filtradas.filter((m) => m.tipo === t);
    return { v: l.reduce((s, m) => s + campo(m), 0), n: l.length };
  };
  const compras = soma("compra", (m) => m.valor_liquido_brl);
  const vendas = soma("venda", (m) => m.valor_liquido_brl);
  const proventos = soma("provento", (m) => m.valor_bruto);
  const proventosLiq = soma("provento", (m) => m.valor_liquido_brl);
  const operacoes = (n: number) => `${n} ${n === 1 ? "operação" : "operações"}`;
  const temFiltro = de || ate || ativoF !== "todos" || opF !== "todos" || corrF !== "todos";
  // Saldo investido nas linhas visíveis: compras entram, vendas e proventos saem
  const saldo = compras.v - vendas.v - proventosLiq.v;

  // O popover abre logo abaixo do título clicado. Posição fixa na tela, porque a tabela tem
  // rolagem horizontal e cortaria um popover posicionado dentro dela.
  const [posicao, setPosicao] = useState({ top: 0, left: 0 });
  const alternar = (id: Exclude<Filtro, null>, e: React.MouseEvent<HTMLButtonElement>) => {
    if (aberto === id) { setAberto(null); return; }
    const r = e.currentTarget.getBoundingClientRect();
    setPosicao({ top: r.bottom + 6, left: Math.max(8, Math.min(r.left, window.innerWidth - 272)) });
    setAberto(id);
  };

  const opcoes = <T extends string>(lista: { id: T; rotulo: string }[], valor: T, set: (v: T) => void) => (
    <div className="max-h-64 overflow-y-auto py-1">
      {lista.map((o) => (
        <button key={o.id} type="button" onClick={() => { set(o.id); setAberto(null); }}
          className="w-full text-left px-3 py-1.5 text-sm hover:bg-secondary/50"
          style={o.id === valor ? { backgroundColor: `${ACCENT}14`, fontWeight: 600 } : undefined}>
          {o.rotulo}
        </button>
      ))}
    </div>
  );

  const m = movs.find((x) => x.id === selecionada) ?? null;

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-border bg-card shadow-sm">
        <div className={`px-4 py-3 flex flex-wrap items-center justify-between gap-2${recolhido ? "" : " border-b border-border"}`}>
          <button type="button" aria-expanded={!recolhido} onClick={() => { setAberto(null); setRecolhido((r) => !r); }}
            className="flex items-center gap-2 text-left">
            <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform${recolhido ? " -rotate-90" : ""}`} aria-hidden />
            <h2 className="text-base font-bold text-foreground" style={{ fontFamily: "Sora, sans-serif" }}>Histórico de movimentações</h2>
            {recolhido && <span className="text-xs text-muted-foreground">{movs.length} {movs.length === 1 ? "registro" : "registros"}</span>}
          </button>
          {temFiltro && (
            <button type="button" className="text-xs font-semibold" style={{ color: ACCENT }}
              onClick={() => { setDe(""); setAte(""); setAtivoF("todos"); setOpF("todos"); setCorrF("todos"); }}>
              Limpar filtros
            </button>
          )}
        </div>

        {!recolhido && (<>
        {/* Totais das linhas visíveis (acompanham os filtros) */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 p-4 border-b border-border">
          <Total rotulo="Compras" valor={compras.v} sub={operacoes(compras.n)} cor={VERDE} />
          <Total rotulo="Vendas" valor={vendas.v} sub={operacoes(vendas.n)} cor={VERMELHO} />
          <Total rotulo="Proventos" valor={proventos.v} sub={`${operacoes(proventos.n)} (valor bruto)`} cor={AZUL} />
          <Total rotulo={temFiltro ? "Saldo investido no filtro" : "Saldo investido no período"} valor={saldo} sub="compras − vendas − proventos" />
        </div>

        {aberto && (
          <div className="fixed inset-0 z-30" onClick={() => setAberto(null)}
            onWheel={() => setAberto(null)} onTouchMove={() => setAberto(null)} />
        )}
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-secondary/30">
              <tr className="border-b border-border text-left text-xs text-muted-foreground">
                <CabecalhoFiltro rotulo="Data" onClick={(e) => alternar("data", e)}
                  ativo={de || ate ? `${de ? fmtDataCurta(de) : "…"} – ${ate ? fmtDataCurta(ate) : "…"}` : ""} />
                <CabecalhoFiltro rotulo="Ativo" onClick={(e) => alternar("ativo", e)} ativo={ativoF !== "todos" ? codigo(ativoF) : ""} />
                <CabecalhoFiltro rotulo="Operação" onClick={(e) => alternar("op", e)} ativo={opF !== "todos" ? OPERACAO[opF] : ""} />
                <CabecalhoFiltro rotulo="Corretora" onClick={(e) => alternar("corretora", e)} ativo={corrF !== "todos" ? nomeCorretora(corrF) : ""}
                  className="hidden md:table-cell" />
                <th className="px-4 py-2.5 text-right font-bold hidden sm:table-cell">Taxas</th>
                <th className="px-4 py-2.5 text-right font-bold hidden sm:table-cell">Valor da cota</th>
                <th className="px-4 py-2.5 text-right font-bold hidden sm:table-cell">Cotas</th>
                <th className="px-4 py-2.5 text-right font-bold">Valor líquido</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtradas.length === 0 && (
                <tr><td colSpan={8} className="px-4 py-8 text-center text-muted-foreground">
                  {movs.length ? "Nenhuma movimentação com esses filtros." : "Nenhuma movimentação registrada."}
                </td></tr>
              )}
              {filtradas.map((x, i) => (
                <tr key={x.id} onClick={() => setSelecionada(x.id)} className="cursor-pointer hover:bg-secondary/30 transition-colors"
                  // linha mais grossa quando o ano muda em relação à movimentação de cima
                  style={i > 0 && x.data.slice(0, 4) !== filtradas[i - 1].data.slice(0, 4) ? { borderTopWidth: 3 } : undefined}>
                  <td className="px-4 py-2.5 whitespace-nowrap text-muted-foreground">{fmtData(x.data)}</td>
                  <td className="px-4 py-2.5 font-bold text-foreground">
                    {codigo(x.ativo_id)}{x.observacoes && <span title="Tem observações" className="ml-1 text-muted-foreground">•</span>}
                  </td>
                  <td className="px-4 py-2.5" style={{ color: COR_OP[x.tipo] }}>{OPERACAO[x.tipo]}</td>
                  <td className="px-4 py-2.5 hidden md:table-cell text-muted-foreground">{nomeCorretora(x.corretora_id)}</td>
                  <td className="px-4 py-2.5 text-right hidden sm:table-cell tabular-nums">{fmtBRL(taxasDe(x))}</td>
                  <td className="px-4 py-2.5 text-right hidden sm:table-cell tabular-nums whitespace-nowrap">
                    {x.preco_unit != null ? `${x.moeda === "BRL" ? "R$" : x.moeda} ${fmtNum(x.preco_unit, 2, 4)}` : "—"}
                  </td>
                  <td className="px-4 py-2.5 text-right hidden sm:table-cell tabular-nums">{x.quantidade != null ? fmtNum(x.quantidade, 0, 8) : "—"}</td>
                  <td className="px-4 py-2.5 text-right font-semibold tabular-nums whitespace-nowrap" style={{ color: COR_OP[x.tipo] }}>
                    {x.tipo === "compra" ? "+ " : x.tipo === "venda" ? "− " : ""}{fmtBRL(x.valor_liquido_brl)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Popovers dos filtros */}
        {aberto && (
          <div className="fixed z-40" style={{ top: posicao.top, left: posicao.left }}>
            <div className="w-64 rounded-xl border border-border bg-popover shadow-lg p-2">
              {aberto === "data" && (
                <div className="space-y-2 p-1">
                  <label className="block text-xs font-semibold text-muted-foreground">De
                    <input type="date" className={`${inputCls} mt-1`} value={de} onChange={(e) => setDe(e.target.value)} />
                  </label>
                  <label className="block text-xs font-semibold text-muted-foreground">Até
                    <input type="date" className={`${inputCls} mt-1`} value={ate} onChange={(e) => setAte(e.target.value)} />
                  </label>
                  <div className="flex justify-between pt-1">
                    <button type="button" className="text-xs font-semibold text-muted-foreground" onClick={() => { setDe(""); setAte(""); setAberto(null); }}>Limpar</button>
                    <button type="button" className="text-xs font-semibold" style={{ color: ACCENT }} onClick={() => setAberto(null)}>Aplicar</button>
                  </div>
                </div>
              )}
              {aberto === "ativo" && opcoes([{ id: "todos", rotulo: "Todos os ativos" }, ...ativos.map((a) => ({ id: a.id, rotulo: a.codigo }))], ativoF, setAtivoF)}
              {aberto === "op" && opcoes<"todos" | MovCompleta["tipo"]>([
                { id: "todos", rotulo: "Todas" }, { id: "compra", rotulo: "Compra" }, { id: "venda", rotulo: "Venda" }, { id: "provento", rotulo: "Provento" },
              ], opF, setOpF)}
              {aberto === "corretora" && opcoes([{ id: "todos", rotulo: "Todas" }, ...corretoras.map((c) => ({ id: c.id, rotulo: c.nome }))], corrF, setCorrF)}
            </div>
          </div>
        )}
        </>)}
      </div>

      {m && (
        <Detalhe m={m} codigo={codigo(m.ativo_id)} corretora={nomeCorretora(m.corretora_id)} isReadOnly={isReadOnly}
          onFechar={() => setSelecionada(null)} />
      )}
    </div>
  );
}

// Título de coluna que abre o filtro (popover); mostra o filtro ativo em azul
function CabecalhoFiltro({
  rotulo, ativo, onClick, className = "",
}: {
  rotulo: string; ativo: string; onClick: (e: React.MouseEvent<HTMLButtonElement>) => void; className?: string;
}) {
  return (
    <th className={`px-4 py-2.5 ${className}`}>
      <button type="button" onClick={onClick} className="inline-flex items-center gap-1 font-bold" style={{ color: ativo ? AZUL : undefined }}>
        {rotulo}{ativo ? `: ${ativo}` : ""} <Filter className="h-3 w-3 opacity-60" />
      </button>
    </th>
  );
}

function Total({ rotulo, valor, sub, cor }: { rotulo: string; valor: number; sub: string; cor?: string }) {
  return (
    <div className="rounded-xl bg-secondary/30 px-3 py-2.5">
      <p className="text-xs text-muted-foreground font-medium">{rotulo}</p>
      <p className="text-base font-bold mt-1 tabular-nums" style={{ color: cor ?? "hsl(var(--foreground))" }}>{fmtBRL(valor)}</p>
      <p className="text-[11px] text-muted-foreground">{sub}</p>
    </div>
  );
}

type Item = { k: string; v: string; nota?: string; forte?: boolean; cor?: string };

// Modal de detalhes (SPEC §4.4): Operação, Câmbio, Taxas e impostos, Resumo e Observações
function Detalhe({
  m, codigo, corretora, isReadOnly, onFechar,
}: {
  m: MovCompleta; codigo: string; corretora: string; isReadOnly: boolean; onFechar: () => void;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [obs, setObs] = useState(m.observacoes ?? "");
  const [salvando, setSalvando] = useState(false);
  const [confirmarExclusao, setConfirmarExclusao] = useState(false);
  const [excluindo, setExcluindo] = useState(false);

  const moeda = m.moeda === "BRL" ? "R$" : m.moeda;
  const fmtMoeda = (v: number) => (m.moeda === "BRL" ? fmtBRL(v) : `${moeda} ${fmtNum(v, 2, 2)}`);
  const bruto = brutoBRL(m);
  const sobre = (v: number, base: number) => (base > 0 ? `${fmtNum((v / base) * 100, 2, 3)}% sobre ${fmtBRL(base)}` : "");

  const grupos: { titulo: string; itens: Item[] }[] = [];
  if (m.tipo === "provento") {
    grupos.push({ titulo: "Provento", itens: [
      { k: "Tipo", v: m.provento_tipo ? PROVENTO[m.provento_tipo] : "—" },
      { k: "Valor bruto", v: fmtBRL(m.valor_bruto) },
      { k: "IR retido na fonte", v: fmtBRL(m.ir_retido) },
      { k: "Valor líquido na conta", v: fmtBRL(m.valor_liquido_brl), nota: "sai do patrimônio até ser reinvestido", forte: true, cor: AZUL },
    ] });
  } else {
    grupos.push({ titulo: "Operação", itens: [
      { k: "Quantidade de cotas", v: fmtNum(m.quantidade ?? 0, 0, 8) },
      { k: "Valor da cota", v: fmtMoeda(m.preco_unit ?? 0), nota: m.moeda !== "BRL" ? `≈ ${fmtBRL((m.preco_unit ?? 0) * (m.cambio_usado ?? 0))}` : undefined },
      {
        k: m.tipo === "venda" ? "Valor bruto da venda" : "Valor investido", v: fmtMoeda(m.valor_bruto),
        nota: m.moeda !== "BRL" ? `≈ ${fmtBRL(bruto)}` : undefined, forte: true,
      },
    ] });
    if (m.moeda !== "BRL" && m.cambio_usado) {
      const spreadPct = m.tipo === "compra" && m.valor_liquido_brl > 0 ? (m.spread_valor / m.valor_liquido_brl) * 100 : 0;
      grupos.push({ titulo: "Câmbio", itens: [
        { k: "Cotação comercial", v: `R$ ${fmtNum(m.cambio_usado, 4, 4)}` },
        ...(spreadPct > 0 ? [{ k: "Cotação efetiva com spread", v: `R$ ${fmtNum(m.cambio_usado * (1 + spreadPct / 100), 4, 4)}` }] : []),
        ...(m.ptax_venda ? [{ k: "PTAX de venda do dia", v: `R$ ${fmtNum(m.ptax_venda, 4, 4)}`, nota: "base do IR no exterior" }] : []),
        m.tipo === "compra"
          ? { k: "Valor remetido em reais", v: fmtBRL(m.valor_liquido_brl), nota: "investido + taxas" }
          : { k: "Valor recebido em reais", v: fmtBRL(m.valor_liquido_brl) },
      ] });
    }
    const base = m.tipo === "compra" ? m.valor_liquido_brl : bruto;
    const ir = m.ir_estimado ?? m.ir_retido;
    const taxas: Item[] = [
      { k: "Corretagem", v: fmtBRL(m.corretagem), nota: m.corretagem > 0 ? sobre(m.corretagem, base) : "isenta" },
      ...(m.moeda !== "BRL"
        ? [
          { k: "Spread cambial", v: fmtBRL(m.spread_valor), nota: sobre(m.spread_valor, m.tipo === "compra" ? base : bruto - m.corretagem) },
          { k: m.tipo === "compra" ? "IOF de câmbio na remessa" : "IOF de câmbio no retorno", v: fmtBRL(m.iof_valor), nota: sobre(m.iof_valor, m.tipo === "compra" ? base : bruto - m.corretagem) },
        ]
        : [{ k: "Emolumentos B3", v: fmtBRL(m.emolumentos), nota: sobre(m.emolumentos, base) }]),
      ...(m.outras_taxas > 0 ? [{ k: "Outras taxas", v: fmtBRL(m.outras_taxas) }] : []),
      ...(m.tipo === "venda" ? [{ k: m.ir_retido > 0 ? "IR retido na fonte" : "IR estimado sobre o ganho", v: fmtBRL(ir) }] : []),
    ];
    const totalTaxas = taxasDe(m);
    taxas.push({ k: "Total de taxas", v: fmtBRL(totalTaxas), nota: base > 0 ? `${fmtNum((totalTaxas / base) * 100, 2, 2)}% da operação` : "", forte: true, cor: "#8A5A00" });
    grupos.push({ titulo: "Taxas e impostos", itens: taxas });
    grupos.push({ titulo: "Resumo", itens: m.tipo === "compra"
      ? [{ k: "Desembolso total", v: fmtBRL(m.valor_liquido_brl) }, { k: "Valor que entra na carteira", v: fmtBRL(m.valor_liquido_brl - totalTaxas), forte: true, cor: VERDE }]
      : [{ k: "Valor líquido na conta", v: fmtBRL(m.valor_liquido_brl), nota: "sai do patrimônio da carteira", forte: true, cor: VERMELHO }] });
  }

  const salvarObs = async () => {
    setSalvando(true);
    try {
      const res = await fetch(`/api/carteira/movimentacoes/${m.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ observacoes: obs }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? "Erro ao salvar");
      toast({ title: "Observações salvas" });
      router.refresh();
    } catch (e) {
      toast({ variant: "destructive", title: "Erro", description: e instanceof Error ? e.message : String(e) });
    } finally {
      setSalvando(false);
    }
  };

  const excluir = async () => {
    setExcluindo(true);
    try {
      const res = await fetch(`/api/carteira/movimentacoes/${m.id}`, { method: "DELETE" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? "Erro ao excluir");
      toast({ title: "Movimentação excluída" });
      onFechar();
      router.refresh();
    } catch (e) {
      toast({ variant: "destructive", title: "Erro", description: e instanceof Error ? e.message : String(e) });
      setExcluindo(false);
      setConfirmarExclusao(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onFechar}>
      <div className="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl border border-border bg-card shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3 px-5 pt-5">
          <div>
            <p className="text-xs font-bold uppercase tracking-wide" style={{ color: COR_OP[m.tipo] }}>{OPERACAO[m.tipo]}</p>
            <h3 className="text-lg font-bold text-foreground" style={{ fontFamily: "Sora, sans-serif" }}>{codigo}</h3>
            <p className="text-xs text-muted-foreground">{fmtData(m.data)} · {corretora}</p>
          </div>
          <button type="button" onClick={onFechar} aria-label="Fechar" className="p-1.5 rounded-lg hover:bg-secondary/60 text-muted-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="px-5 py-4 space-y-4">
          {grupos.map((g) => (
            <div key={g.titulo}>
              <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-wide mb-1.5">{g.titulo}</p>
              <div className="space-y-1">
                {g.itens.map((i) => (
                  <div key={i.k} className="flex items-baseline justify-between gap-3 text-sm">
                    <span className="text-muted-foreground">{i.k}{i.nota && <span className="block text-[11px] text-muted-foreground/80">{i.nota}</span>}</span>
                    <span className={`tabular-nums whitespace-nowrap ${i.forte ? "font-bold" : "font-medium"}`} style={{ color: i.cor }}>{i.v}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}

          <div>
            <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-wide mb-1.5">Observações</p>
            <textarea className={`${inputCls} min-h-20`} value={obs} disabled={isReadOnly} onChange={(e) => setObs(e.target.value)}
              placeholder={isReadOnly ? "" : "Anote o motivo da operação, por exemplo"} />
            {!isReadOnly && obs !== (m.observacoes ?? "") && (
              <div className="flex justify-end mt-2">
                <button type="button" onClick={salvarObs} disabled={salvando}
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold text-white flex items-center gap-1.5 disabled:opacity-60" style={{ backgroundColor: ACCENT }}>
                  {salvando && <Loader2 className="h-3 w-3 animate-spin" />}Salvar observações
                </button>
              </div>
            )}
          </div>
        </div>

        {!isReadOnly && (
          <div className="px-5 py-3 border-t border-border flex items-center justify-between gap-2">
            {confirmarExclusao ? (
              <>
                <span className="text-xs font-medium" style={{ color: VERMELHO }}>Excluir esta movimentação? Não dá para desfazer.</span>
                <span className="flex gap-2">
                  <button type="button" onClick={() => setConfirmarExclusao(false)} className="px-3 py-1.5 rounded-lg text-xs font-semibold border border-border">Cancelar</button>
                  <button type="button" onClick={excluir} disabled={excluindo}
                    className="px-3 py-1.5 rounded-lg text-xs font-semibold text-white flex items-center gap-1.5 disabled:opacity-60" style={{ backgroundColor: VERMELHO }}>
                    {excluindo && <Loader2 className="h-3 w-3 animate-spin" />}Excluir
                  </button>
                </span>
              </>
            ) : (
              <button type="button" onClick={() => setConfirmarExclusao(true)} className="text-xs font-semibold" style={{ color: VERMELHO }}>
                Excluir movimentação
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
