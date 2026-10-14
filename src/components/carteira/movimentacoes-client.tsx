"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";
import { useToast } from "@/hooks/use-toast";
import { CORRETORA_PADRAO, TIPOS_ATIVO, type ChaveAliquota, type TipoAtivo } from "@/lib/carteira/constantes";
import { fmtBRL, fmtNum } from "@/lib/carteira/numeros";
import {
  calcularCompra, calcularVenda, custosAquisicao, efeitoNaCarteira, excessoAteBorda, precoMedio,
  sugestaoAporte, sugestaoVenda, type CustosCorretora, type Status,
} from "@/lib/carteira/operacoes";
import { bandaEfetiva } from "@/lib/carteira/regras";
import type { Aliquotas, Ativo, Bloco, Corretora } from "@/lib/carteira/tipos";
import { ACCENT, Campo, DecimalInput, inputCls, VERMELHO } from "@/components/carteira/campos";
import { HistoricoMovimentacoes } from "@/components/carteira/historico-movimentacoes";

// Movimentações (docs/carteira/SPEC.md §4.4). Custos em REGRAS §5, IR estimado em §7.

export type MovCompleta = {
  id: string; data: string; tipo: "compra" | "venda" | "provento"; ativo_id: string; corretora_id: string | null;
  quantidade: number | null; preco_unit: number | null; moeda: string; valor_bruto: number;
  cambio_usado: number | null; ptax_venda: number | null;
  spread_valor: number; iof_valor: number; corretagem: number; emolumentos: number; outras_taxas: number;
  provento_tipo: "dividendo" | "jcp" | "rendimento" | null; ir_retido: number; ir_estimado: number | null;
  valor_liquido_brl: number; observacoes: string | null;
};

type Preco = { preco: number; moeda: string; data: string } | null;
type Aba = "compra" | "venda" | "provento";

const fmtPp = (v: number) => fmtNum(v, 0, 2);
const pct1 = (v: number) => `${fmtNum(v, 1, 1)}%`;
const STATUS_TXT: Record<Status, string> = { dentro: "Dentro", acima: "Acima da banda", abaixo: "Abaixo da banda" };

export function MovimentacoesClient({
  isReadOnly, ownerName, hoje, ativos, blocos, corretoras, tons, valores, quantidades, precos, cambios, aliquotas, movs, inicial,
}: {
  isReadOnly: boolean;
  ownerName: string | null;
  hoje: string;
  ativos: Ativo[];
  blocos: Bloco[];
  corretoras: Corretora[];
  tons: Record<string, string>;
  valores: Record<string, number>;
  quantidades: Record<string, number>;
  precos: Record<string, Preco>;
  cambios: Record<string, number>;
  aliquotas: Aliquotas;
  movs: MovCompleta[];
  inicial: { op: Aba; ativoId: string | null; valor: number | null };
}) {
  const router = useRouter();
  const { toast } = useToast();

  const sugCompra = useMemo(() => sugestaoAporte(ativos, valores), [ativos, valores]);
  const sugVenda = useMemo(() => sugestaoVenda(ativos, valores), [ativos, valores]);

  const ativoPadrao = (aba: Aba) =>
    (aba === "venda" ? sugVenda?.ativo.id : sugCompra?.ativo.id) ?? ativos[0]?.id ?? "";

  const [aba, setAba] = useState<Aba>(inicial.op);
  const [ativoId, setAtivoId] = useState(inicial.ativoId ?? ativoPadrao(inicial.op));
  const ativo = ativos.find((a) => a.id === ativoId);
  const [corretoraId, setCorretoraId] = useState<string>(ativo?.corretora_id ?? corretoras[0]?.id ?? "");
  const [data, setData] = useState(hoje);
  const [valor, setValor] = useState<number | null>(inicial.op === "venda" ? inicial.valor : null);
  const [preco, setPreco] = useState<number | null>(ativo ? precos[ativo.id]?.preco ?? null : null);
  const [cambio, setCambio] = useState<number | null>(ativo && ativo.moeda !== "BRL" ? cambios[ativo.moeda] ?? null : null);
  const [cotaHora, setCotaHora] = useState("");
  const [atualizandoCota, setAtualizandoCota] = useState(false);
  const [provTipo, setProvTipo] = useState<"dividendo" | "jcp" | "rendimento">("dividendo");
  const [provBruto, setProvBruto] = useState<number | null>(null);
  const [provIr, setProvIr] = useState<number | null>(null);
  const [obs, setObs] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");
  const [novoAberto, setNovoAberto] = useState(false);

  const escolherAtivo = (id: string) => {
    const a = ativos.find((x) => x.id === id);
    setAtivoId(id);
    setErro("");
    setPreco(a ? precos[a.id]?.preco ?? null : null);
    setCambio(a && a.moeda !== "BRL" ? cambios[a.moeda] ?? null : null);
    setCotaHora("");
    if (a?.corretora_id) setCorretoraId(a.corretora_id);
  };

  const trocarAba = (nova: Aba) => {
    setAba(nova);
    setErro("");
    setValor(null);
    escolherAtivo(ativoPadrao(nova));
  };

  // ── Cálculo ──
  const corretora = corretoras.find((c) => c.id === corretoraId);
  const custos: CustosCorretora = corretora ?? { ...CORRETORA_PADRAO };
  const exterior = ativo?.mercado === "exterior";
  const cambioEfetivo = ativo?.moeda === "BRL" ? 1 : cambio ?? 0;
  const dolar = cambios.USD ?? cambioEfetivo;
  const naCarteira = ativo ? quantidades[ativo.id] ?? 0 : 0;

  const compra = ativo && aba === "compra"
    ? calcularCompra({ valor: valor ?? 0, preco: preco ?? 0, cambio: cambioEfetivo, exterior, corretora: custos, dolar })
    : null;

  const movsDoAtivo = ativo ? movs.filter((m) => m.ativo_id === ativo.id) : [];
  const pm = precoMedio(movsDoAtivo, data).pm;
  const chaveAliq: ChaveAliquota | null = ativo ? (exterior ? "exterior" : ativo.tipo) : null;
  const aliquota = chaveAliq ? aliquotas[chaveAliq] ?? 15 : 15;
  const cotasVenda = ativo && aba === "venda" && (preco ?? 0) > 0 && cambioEfetivo > 0
    ? (ativo.moeda === "BRL"
      ? Math.floor((valor ?? 0) / (preco ?? 1))
      : Math.floor(((valor ?? 0) / ((preco ?? 1) * cambioEfetivo)) * 10000 + 1e-6) / 10000)
    : 0;
  const venda = ativo && aba === "venda"
    ? calcularVenda({ cotas: cotasVenda, preco: preco ?? 0, cambio: cambioEfetivo, exterior, corretora: custos, dolar, precoMedioBRL: pm, aliquotaPct: aliquota })
    : null;

  const irProv = Math.min(provBruto ?? 0, Math.max(0, provIr ?? 0));

  const deltas: Record<string, number> = !ativo ? {}
    : aba === "compra" ? { [ativo.id]: compra?.ordem ?? 0 }
    : aba === "venda" ? { [ativo.id]: -(venda?.bruto ?? 0) }
    : {};
  const efeito = efeitoNaCarteira(ativos, valores, deltas, ativo ? [ativo.id] : []);

  // ── Ações ──
  const atualizarCota = async () => {
    if (!ativo?.ticker_cotacao) return;
    setAtualizandoCota(true);
    try {
      const res = await fetch(`/api/carteira/cotacoes/verificar?t=${encodeURIComponent(ativo.ticker_cotacao)}`);
      const r = (await res.json()).resultados?.[0];
      if (r?.ok) {
        setPreco(r.preco);
        setCotaHora(new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }));
      } else {
        toast({ variant: "destructive", title: "Cotação indisponível", description: `Sem resposta para ${ativo.ticker_cotacao}.` });
      }
    } finally {
      setAtualizandoCota(false);
    }
  };

  const registrar = async () => {
    if (!ativo) return;
    setErro("");
    let corpo: Record<string, unknown>;
    if (aba === "compra") {
      if (!compra || compra.cotas <= 0) { setErro("Informe o valor da compra e o valor da cota: o valor precisa comprar ao menos uma cota."); return; }
      corpo = {
        quantidade: compra.cotas, preco_unit: preco, valor_bruto: compra.ordemMoeda, cambio_usado: ativo.moeda === "BRL" ? null : cambioEfetivo,
        spread_valor: compra.spread, iof_valor: compra.iof, corretagem: compra.corretagem, emolumentos: compra.emolumentos,
        ir_retido: 0, ir_estimado: null, valor_liquido_brl: compra.desembolso,
      };
    } else if (aba === "venda") {
      if (!venda || cotasVenda <= 0) { setErro("Informe o valor da venda e o valor da cota."); return; }
      if (cotasVenda > naCarteira + 1e-9) { setErro(`Você tem ${fmtNum(naCarteira, 0, 8)} cotas de ${ativo.codigo}.`); return; }
      const retidoNaFonte = ativo.tipo === "etf_rf" && !exterior; // REGRAS §7: ETF de renda fixa na B3
      corpo = {
        quantidade: cotasVenda, preco_unit: preco, valor_bruto: venda.brutoMoeda, cambio_usado: ativo.moeda === "BRL" ? null : cambioEfetivo,
        spread_valor: venda.spread, iof_valor: venda.iof, corretagem: venda.corretagem, emolumentos: venda.emolumentos,
        ir_retido: retidoNaFonte ? venda.ir : 0, ir_estimado: venda.ir, valor_liquido_brl: venda.liquido,
      };
    } else {
      if (!((provBruto ?? 0) > 0)) { setErro("Informe o valor bruto do provento."); return; }
      if ((provBruto ?? 0) - irProv <= 0) { setErro("O valor líquido precisa ser maior que zero."); return; }
      corpo = {
        quantidade: null, preco_unit: null, valor_bruto: provBruto, cambio_usado: null, provento_tipo: provTipo,
        spread_valor: 0, iof_valor: 0, corretagem: 0, emolumentos: 0, ir_retido: irProv, ir_estimado: null,
        valor_liquido_brl: (provBruto ?? 0) - irProv,
      };
    }
    setSalvando(true);
    try {
      const res = await fetch("/api/carteira/movimentacoes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provento_tipo: null, outras_taxas: 0, ...corpo,
          tipo: aba, data, ativo_id: ativo.id, corretora_id: corretoraId || null, observacoes: obs || null,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? "Erro ao registrar");
      toast({ title: aba === "compra" ? "Compra registrada" : aba === "venda" ? "Venda registrada" : "Provento registrado" });
      setValor(null); setProvBruto(null); setProvIr(null); setObs("");
      router.refresh();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro ao registrar");
    } finally {
      setSalvando(false);
    }
  };

  if (!ativos.length) {
    return (
      <div className="rounded-2xl border border-border bg-card p-8 shadow-sm text-center max-w-xl mx-auto">
        <p className="text-base font-bold text-foreground">Nenhum ativo cadastrado</p>
        <p className="text-sm text-muted-foreground mt-1">Cadastre os ativos em Configurações › Carteira para registrar movimentações.</p>
      </div>
    );
  }

  const moedaRot = ativo?.moeda === "BRL" ? "R$" : ativo?.moeda ?? "";
  const cotacaoInfo = ativo ? precos[ativo.id] : null;

  return (
    <div className="space-y-6">
      {isReadOnly && (
        <div className="flex items-center gap-2 px-4 py-2.5 rounded-xl border text-sm font-medium"
          style={{ borderColor: `${ACCENT}4d`, backgroundColor: `${ACCENT}0d`, color: ACCENT }}>
          <span className="text-base">👁</span>
          Você está vendo as movimentações de <strong>{ownerName ?? "outro membro"}</strong>, somente leitura
        </div>
      )}

      <div className="grid grid-cols-1 min-[900px]:grid-cols-[minmax(0,1fr)_380px] gap-4 items-start">
        {/* ── Formulário ── */}
        {!isReadOnly && (
          <div className="rounded-2xl border border-border bg-card p-4 sm:p-5 shadow-sm space-y-4">
            <div className="inline-flex rounded-lg bg-secondary/50 p-1" role="tablist">
              {(["compra", "venda", "provento"] as const).map((t) => (
                <button key={t} type="button" role="tab" aria-selected={aba === t} onClick={() => trocarAba(t)}
                  className="px-4 py-1.5 rounded-md text-sm font-semibold transition-colors"
                  style={aba === t ? { backgroundColor: "var(--card)", color: "var(--foreground)", boxShadow: "0 1px 2px rgba(0,0,0,0.08)" } : { color: "var(--muted-foreground)" }}>
                  {t === "compra" ? "Compra" : t === "venda" ? "Venda" : "Provento"}
                </button>
              ))}
            </div>

            <div>
              <h2 className="text-base font-bold text-foreground" style={{ fontFamily: "Sora, sans-serif" }}>
                {aba === "compra" ? "Registrar compra" : aba === "venda" ? "Registrar venda" : "Registrar provento"}
              </h2>
              <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
                {aba === "compra" && "A regra do plano sugere comprar o ativo mais abaixo do alvo. Você pode escolher outro."}
                {aba === "venda" && "Venda só quando um ativo sair da banda, e apenas até a borda dela, ou para a retirada do mês. O valor vendido sai do patrimônio da carteira até ser reinvestido."}
                {aba === "provento" && "Dividendos, JCP e rendimentos caem na conta e saem do patrimônio da carteira até serem reinvestidos por uma compra, como uma venda. Eles contam como rendimento da carteira."}
              </p>
            </div>

            <Sugestao aba={aba} sugCompra={sugCompra} sugVenda={sugVenda} onUsar={(id, v) => { escolherAtivo(id); if (v != null) setValor(Math.round(v * 100) / 100); }} />

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Campo label="Ativo">
                <select className={inputCls} value={ativoId}
                  onChange={(e) => { if (e.target.value === "__novo") setNovoAberto(true); else escolherAtivo(e.target.value); }}>
                  {!ativo && <option value="">Carregando…</option>}
                  {ativos.map((a) => <option key={a.id} value={a.id}>{a.codigo}</option>)}
                  {aba === "compra" && <option value="__novo">+ Cadastrar novo ativo…</option>}
                </select>
              </Campo>
              <Campo label="Corretora">
                <select className={inputCls} value={corretoraId} onChange={(e) => setCorretoraId(e.target.value)}>
                  {!corretoras.length && <option value="">Sem corretora (custos padrão do Inter)</option>}
                  {corretoras.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
                </select>
              </Campo>
              <Campo label="Data">
                <input type="date" className={inputCls} value={data} max={hoje} onChange={(e) => setData(e.target.value)} />
              </Campo>

              {aba !== "provento" ? (
                <>
                  <Campo label={aba === "compra" ? "Valor da compra (R$)" : "Valor da venda (R$)"}
                    nota={aba === "venda" && ativo ? `Na carteira: ${fmtNum(naCarteira, 0, 8)} cotas (${fmtBRL(valores[ativo.id] ?? 0)})` : undefined}>
                    <DecimalInput value={valor} casas={2} ariaLabel="Valor em reais" onValue={(v) => { setErro(""); setValor(v); }} />
                  </Campo>
                  <Campo label={`Valor da cota (${moedaRot})`}
                    nota={
                      <span className="flex flex-wrap items-center gap-x-2">
                        {ativo?.ticker_cotacao && (
                          <button type="button" onClick={atualizarCota} disabled={atualizandoCota} className="font-semibold" style={{ color: ACCENT }}>
                            {atualizandoCota ? "Atualizando…" : "↻ Atualizar"}
                          </button>
                        )}
                        <span>
                          {cotaHora ? `cotação de ${cotaHora}, atraso de até 15 min`
                            : cotacaoInfo ? `fechamento de ${fmtData(cotacaoInfo.data)}` : "sem cotação salva"}
                        </span>
                      </span>
                    }>
                    <DecimalInput value={preco} casas={6} ariaLabel="Valor da cota" onValue={(v) => { setErro(""); setPreco(v); }} />
                  </Campo>
                  {ativo && ativo.moeda !== "BRL" && (
                    <Campo label={`Câmbio comercial (R$ por ${ativo.moeda})`} nota="Cotação do dia; ajuste para a da operação">
                      <DecimalInput value={cambio} casas={4} ariaLabel="Câmbio" onValue={(v) => { setErro(""); setCambio(v); }} />
                    </Campo>
                  )}
                  <div>
                    <span className="text-xs font-semibold text-muted-foreground mb-1 block">Cotas</span>
                    <p className="rounded-lg border border-border bg-secondary/20 px-3 py-2 text-sm font-semibold text-foreground tabular-nums">
                      {fmtNum(aba === "compra" ? compra?.cotas ?? 0 : cotasVenda, 0, 4)} cotas
                    </p>
                  </div>
                </>
              ) : (
                <>
                  <Campo label="Tipo">
                    <select className={inputCls} value={provTipo} onChange={(e) => {
                      const t = e.target.value as typeof provTipo;
                      setProvTipo(t);
                      if (t === "jcp") setProvIr(Math.round((provBruto ?? 0) * 15) / 100);
                      else if (provTipo === "jcp") setProvIr(null);
                    }}>
                      <option value="dividendo">Dividendo</option>
                      <option value="jcp">JCP</option>
                      <option value="rendimento">Rendimento</option>
                    </select>
                  </Campo>
                  <Campo label="Valor bruto (R$)">
                    <DecimalInput value={provBruto} casas={2} ariaLabel="Valor bruto" onValue={(v) => {
                      setErro(""); setProvBruto(v);
                      if (provTipo === "jcp") setProvIr(Math.round((v ?? 0) * 15) / 100);
                    }} />
                  </Campo>
                  <Campo label="IR retido na fonte (R$)"
                    nota={provTipo === "jcp"
                      ? "JCP tem IR retido na fonte (preenchido com 15% do valor bruto; ajuste se for diferente)."
                      : `${provTipo === "rendimento" ? "Rendimentos de FII costumam ser isentos de IR para pessoa física." : "Informe o IR retido apenas se constar no extrato da corretora."} O provento não muda a quantidade de cotas.`}>
                    <DecimalInput value={provIr} casas={2} ariaLabel="IR retido" onValue={(v) => { setErro(""); setProvIr(v); }} />
                  </Campo>
                </>
              )}
            </div>

            {aba === "venda" && ativo && <DicaVenda ativo={ativo} valores={valores} onUsar={(v) => setValor(Math.round(v * 100) / 100)} />}

            {/* Linhas de custo */}
            <div className="rounded-xl bg-secondary/30 p-3 space-y-1.5">
              {aba === "compra" && compra && ativo && (
                <>
                  <Linha k="Valor da compra" v={fmtBRL(valor ?? 0)} />
                  <Linha k={exterior ? `Custos da remessa (spread ${fmtPp(custos.spread_pct)}% + IOF ${fmtPp(custos.iof_ida_pct)}%)` : "Custos de câmbio"}
                    v={exterior ? `− ${fmtBRL(compra.spread + compra.iof)}` : "—"} fraco />
                  <Linha k={`Corretagem (${notaCorretagem(exterior, custos, (valor ?? 0) - compra.spread - compra.iof, compra.corretagem)})`}
                    v={compra.corretagem > 0 ? `− ${fmtBRL(compra.corretagem)}` : "—"} fraco />
                  {!exterior && <Linha k={`Emolumentos B3 (${fmtPp(custos.emolumentos_pct)}%)`} v={compra.emolumentos > 0 ? `− ${fmtBRL(compra.emolumentos)}` : "—"} fraco />}
                  <Linha k="Valor investido" v={fmtBRL(compra.ordem)} forte />
                  {!exterior && (valor ?? 0) - compra.desembolso > 0.009 && (
                    <p className="text-[11px] text-muted-foreground">Sobram {fmtBRL((valor ?? 0) - compra.desembolso)} por causa das cotas inteiras.</p>
                  )}
                </>
              )}
              {aba === "venda" && venda && ativo && (
                <>
                  <Linha k="Valor da venda" v={fmtBRL(venda.bruto)} />
                  <Linha k={`Imposto de renda estimado (${fmtPp(aliquota)}% sobre ganho de ${fmtBRL(Math.max(0, venda.ganho))})`} v={venda.ir > 0 ? `− ${fmtBRL(venda.ir)}` : "—"} fraco />
                  <Linha k={`Corretagem (${notaCorretagem(exterior, custos, venda.bruto, venda.corretagem)})`} v={venda.corretagem > 0 ? `− ${fmtBRL(venda.corretagem)}` : "—"} fraco />
                  {!exterior && <Linha k={`Emolumentos B3 (${fmtPp(custos.emolumentos_pct)}%)`} v={venda.emolumentos > 0 ? `− ${fmtBRL(venda.emolumentos)}` : "—"} fraco />}
                  <Linha k={exterior ? `Câmbio no retorno (spread ${fmtPp(custos.spread_pct)}% + IOF ${fmtPp(custos.iof_volta_pct)}%)` : "Custos de câmbio"}
                    v={exterior ? `− ${fmtBRL(venda.cambioRetorno)}` : "—"} fraco />
                  <Linha k="Valor líquido na conta" v={fmtBRL(venda.liquido)} forte />
                  <p className="text-[11px] text-muted-foreground">
                    Preço médio: {fmtBRL(pm)} por cota. O app estima o imposto e não substitui um contador.
                  </p>
                </>
              )}
              {aba === "provento" && (
                <>
                  <Linha k="Valor bruto" v={fmtBRL(provBruto ?? 0)} />
                  <Linha k="IR retido na fonte" v={irProv > 0 ? `− ${fmtBRL(irProv)}` : "—"} fraco />
                  <Linha k="Valor líquido na conta" v={fmtBRL((provBruto ?? 0) - irProv)} forte />
                </>
              )}
            </div>

            <Campo label="Observações">
              <input className={inputCls} placeholder="Opcional" value={obs} onChange={(e) => setObs(e.target.value)} />
            </Campo>

            {erro && <p className="text-sm font-medium" style={{ color: VERMELHO }}>{erro}</p>}

            <div className="flex justify-end">
              <button type="button" onClick={registrar} disabled={salvando || !ativo}
                className="px-5 py-2 rounded-lg text-sm font-semibold text-white flex items-center gap-2 disabled:opacity-60"
                style={{ backgroundColor: ACCENT }}>
                {salvando && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                {aba === "compra" ? "Registrar compra" : aba === "venda" ? "Registrar venda" : "Registrar provento"}
              </button>
            </div>
          </div>
        )}

        {/* ── Coluna direita: efeito na carteira e custos de aquisição ── */}
        <div className={`space-y-4 min-[900px]:sticky min-[900px]:top-20 ${isReadOnly ? "min-[900px]:col-span-2" : ""}`}>
          <div className="rounded-2xl border border-border bg-card shadow-sm overflow-hidden">
            <div className="px-4 py-3 border-b border-border">
              <h2 className="text-base font-bold text-foreground" style={{ fontFamily: "Sora, sans-serif" }}>Efeito na carteira</h2>
            </div>
            <table className="w-full text-xs">
              <thead className="bg-secondary/30">
                <tr className="text-left text-muted-foreground font-bold">
                  <th className="px-3 py-2">Ativo</th>
                  <th className="px-2 py-2 text-right">Alvo</th>
                  <th className="px-2 py-2 text-right">Antes</th>
                  <th className="px-2 py-2 text-right">Depois</th>
                  <th className="px-3 py-2 hidden sm:table-cell">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {efeito.map((l) => {
                  const ativoL = ativos.find((a) => a.id === l.id);
                  const fora = l.statusDepois !== "dentro";
                  return (
                    <tr key={l.id} style={l.foco ? { backgroundColor: `${ACCENT}0f` } : undefined}>
                      <td className="px-3 py-1.5">
                        <span className="flex items-center gap-1.5">
                          <span className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ backgroundColor: tons[ativoL?.bloco_id ?? ""] ?? "#E3E8ED" }} />
                          <span className={l.foco ? "font-bold" : "font-medium"}>{l.codigo}</span>
                        </span>
                      </td>
                      <td className="px-2 py-1.5 text-right tabular-nums">{pct1(l.alvo)}</td>
                      <td className="px-2 py-1.5 text-right tabular-nums" style={{ color: l.statusAntes !== "dentro" ? VERMELHO : undefined }}>{pct1(l.antes)}</td>
                      <td className="px-2 py-1.5 text-right tabular-nums font-semibold" style={{ color: fora ? VERMELHO : undefined }}>{pct1(l.depois)}</td>
                      <td className="px-3 py-1.5 hidden sm:table-cell" style={{ color: fora ? VERMELHO : "var(--muted-foreground)" }}>
                        {l.statusAntes !== l.statusDepois ? `${STATUS_TXT[l.statusAntes]} → ` : ""}{STATUS_TXT[l.statusDepois]}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <CustosAquisicao movs={movs} />
        </div>
      </div>

      <HistoricoMovimentacoes movs={movs} ativos={ativos} corretoras={corretoras} isReadOnly={isReadOnly} />

      {novoAberto && (
        <NovoAtivo blocos={blocos} corretoraId={corretoraId || null}
          onFechar={() => setNovoAberto(false)}
          onCriado={(id) => { setNovoAberto(false); setAtivoId(id); setPreco(null); setCambio(null); router.refresh(); }} />
      )}
    </div>
  );
}

// ── Peças ──────────────────────────────────────────────────────────────────────

const fmtData = (iso: string) => { const [y, m, d] = iso.split("-"); return `${d}/${m}/${y}`; };

function notaCorretagem(exterior: boolean, c: CustosCorretora, base: number, valor: number): string {
  if (exterior) {
    const efetivo = base > 0 ? ` · efetivo ${fmtNum((valor / base) * 100, 0, 2)}%` : "";
    return `${fmtNum(c.corr_ext_pct, 2, 2)}% da ordem, mínimo US$ ${fmtNum(c.corr_ext_min_usd, 2, 2)}${efetivo}`;
  }
  return c.corr_br_pct || c.corr_br_min ? `${fmtPp(c.corr_br_pct)}% da ordem` : "isenta na B3";
}

function Linha({ k, v, forte, fraco }: { k: string; v: string; forte?: boolean; fraco?: boolean }) {
  return (
    <div className={`flex items-baseline justify-between gap-3 ${forte ? "text-[15px] font-bold text-foreground pt-1.5 border-t border-border" : "text-sm"}`}>
      <span className={fraco ? "text-muted-foreground" : ""}>{k}</span>
      <span className={`tabular-nums whitespace-nowrap ${fraco ? "text-muted-foreground" : "font-medium"}`}>{v}</span>
    </div>
  );
}

function Sugestao({
  aba, sugCompra, sugVenda, onUsar,
}: {
  aba: Aba;
  sugCompra: ReturnType<typeof sugestaoAporte>;
  sugVenda: ReturnType<typeof sugestaoVenda>;
  onUsar: (ativoId: string, valor: number | null) => void;
}) {
  const s = aba === "venda" ? sugVenda : sugCompra;
  if (!s) return null;
  const titulo = aba === "compra" ? `Sugestão: ${s.ativo.codigo}` : aba === "venda" ? `Sugestão: vender ${s.ativo.codigo}` : `Para reinvestir: ${s.ativo.codigo}`;
  const detalhe = aba === "venda"
    ? `É o ativo negociado no Brasil mais acima do alvo (${pct1(s.real)} para ${pct1(s.ativo.alvo_pct)}), sem custo de câmbio.`
    : `É o ativo mais abaixo do alvo (${pct1(s.real)} para ${pct1(s.ativo.alvo_pct)}).${aba === "compra" && "falta" in s ? ` Faltam ${fmtBRL(s.falta, 0)}.` : " Registre a compra na aba Compra."}`;
  return (
    <div className="rounded-xl border px-3 py-2.5 flex flex-wrap items-center gap-2" style={{ borderColor: `${ACCENT}40`, backgroundColor: `${ACCENT}0a` }}>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-bold text-foreground">{titulo}</p>
        <p className="text-xs text-muted-foreground">{detalhe}</p>
      </div>
      {aba !== "provento" && (
        <button type="button" onClick={() => onUsar(s.ativo.id, aba === "compra" && "falta" in s && s.falta > 0 ? s.falta : aba === "venda" && "excesso" in s && s.excesso > 0 ? s.excesso : null)}
          className="text-xs font-bold whitespace-nowrap" style={{ color: ACCENT }}>
          Usar sugestão
        </button>
      )}
    </div>
  );
}

function DicaVenda({ ativo, valores, onUsar }: { ativo: Ativo; valores: Record<string, number>; onUsar: (v: number) => void }) {
  const total = Object.values(valores).reduce((s, v) => s + v, 0);
  if (total <= 0) return null;
  const real = ((valores[ativo.id] ?? 0) / total) * 100;
  const excesso = excessoAteBorda(real, ativo.alvo_pct, bandaEfetiva(ativo.alvo_pct, ativo.banda_pp), total);
  return (
    <p className="text-xs text-muted-foreground">
      {excesso > 0 ? (
        <>
          {ativo.codigo} está acima da banda: uma venda de <strong>{fmtBRL(excesso, 0)}</strong> o traz de volta à borda.{" "}
          <button type="button" onClick={() => onUsar(excesso)} className="font-semibold" style={{ color: ACCENT }}>Usar este valor</button>
        </>
      ) : `${ativo.codigo} está dentro da banda.`}
    </p>
  );
}

const CORES_CUSTO = { liquido: "#A3ACB6", spread: "#E2A33B", iof: "#C4532F", corretagem: "#7A4E9C" };

function CustosAquisicao({ movs }: { movs: MovCompleta[] }) {
  const [aberto, setAberto] = useState(false);
  const anos = [...new Set(movs.filter((m) => m.tipo === "compra").map((m) => Number(m.data.slice(0, 4))))].sort((a, b) => b - a);
  const [ano, setAno] = useState<number | null>(null);
  const t = custosAquisicao(movs, ano);
  const fatias = [
    { nome: "Investido líquido", valor: t.liquido, cor: CORES_CUSTO.liquido },
    { nome: "Spread cambial", valor: t.spread, cor: CORES_CUSTO.spread },
    { nome: "IOF", valor: t.iof, cor: CORES_CUSTO.iof },
    { nome: "Corretagem e emolumentos", valor: t.corretagem, cor: CORES_CUSTO.corretagem },
  ].filter((f) => f.valor > 0);
  const pctDe = (v: number) => (t.bruto > 0 ? `${fmtNum((v / t.bruto) * 100, 2, 2)}%` : "—");

  return (
    <div className="rounded-2xl border border-border bg-card shadow-sm">
      <button type="button" onClick={() => setAberto((a) => !a)} aria-expanded={aberto}
        className="w-full flex items-center justify-between gap-2 px-4 py-3 text-left">
        <span className="text-base font-bold text-foreground" style={{ fontFamily: "Sora, sans-serif" }}>Custos de aquisição</span>
        <span className="text-muted-foreground text-sm">{aberto ? "▴" : "▾"}</span>
      </button>
      {aberto && (
        <div className="px-4 pb-4 space-y-3">
          <select className={inputCls} value={ano ?? ""} onChange={(e) => setAno(e.target.value ? Number(e.target.value) : null)}>
            <option value="">Todos os anos</option>
            {anos.map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
          {t.bruto <= 0 ? (
            <p className="text-sm text-muted-foreground">Nenhuma compra no período.</p>
          ) : (
            <>
              <div className="relative h-44">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={fatias} dataKey="valor" nameKey="nome" innerRadius={52} outerRadius={80} startAngle={90} endAngle={-270} isAnimationActive={false}>
                      {fatias.map((f) => <Cell key={f.nome} fill={f.cor} stroke="var(--card)" strokeWidth={2} />)}
                    </Pie>
                    <Tooltip formatter={(v: unknown, n: unknown) => [`${fmtBRL(Number(v))} (${pctDe(Number(v))})`, String(n)]}
                      contentStyle={{ borderRadius: 10, border: "1px solid var(--border)", backgroundColor: "var(--popover)", fontSize: 12 }} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                  <span className="text-[11px] text-muted-foreground">Investido líquido</span>
                  <span className="text-sm font-bold text-foreground">{pctDe(t.liquido)}</span>
                </div>
              </div>
              <div className="space-y-1 text-xs">
                <div className="flex justify-between font-semibold"><span>Total aplicado</span><span className="tabular-nums">{fmtBRL(t.bruto)}</span></div>
                {[["Spread cambial", t.spread, CORES_CUSTO.spread], ["IOF", t.iof, CORES_CUSTO.iof], ["Corretagem e emolumentos", t.corretagem, CORES_CUSTO.corretagem]].map(([n, v, c]) => (
                  <div key={n as string} className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: c as string }} />
                    <span className="flex-1 text-muted-foreground">{n as string}</span>
                    <span className="tabular-nums">− {fmtBRL(v as number)}</span>
                    <span className="tabular-nums text-muted-foreground w-14 text-right">{pctDe(v as number)}</span>
                  </div>
                ))}
                <div className="flex justify-between font-semibold pt-1 border-t border-border">
                  <span>Investido líquido</span><span className="tabular-nums">{fmtBRL(t.liquido)}</span>
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function NovoAtivo({
  blocos, corretoraId, onFechar, onCriado,
}: {
  blocos: Bloco[]; corretoraId: string | null; onFechar: () => void; onCriado: (id: string) => void;
}) {
  const [codigo, setCodigo] = useState("");
  const [tipo, setTipo] = useState<TipoAtivo>("etf_acoes");
  const [mercado, setMercado] = useState<"brasil" | "exterior">("brasil");
  const [blocoId, setBlocoId] = useState(blocos[0]?.id ?? "");
  const [alvo, setAlvo] = useState<number | null>(null);
  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState(false);

  const salvar = async () => {
    setErro("");
    if (!codigo.trim()) { setErro("Informe o código do ativo."); return; }
    setSalvando(true);
    try {
      const res = await fetch("/api/carteira/ativos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ codigo, tipo, mercado, bloco_id: blocoId, alvo_pct: alvo ?? 0, corretora_id: corretoraId }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? "Erro ao cadastrar");
      onCriado(json.id);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Erro ao cadastrar");
      setSalvando(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onFechar}>
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-5 shadow-xl space-y-3" onClick={(e) => e.stopPropagation()}>
        <div>
          <h3 className="text-base font-bold text-foreground" style={{ fontFamily: "Sora, sans-serif" }}>Cadastrar novo ativo</h3>
          <p className="text-xs text-muted-foreground mt-0.5">Cadastro rápido para esta compra. Os demais detalhes (taxa, banda) podem ser ajustados depois em Configurações.</p>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Campo label="Código">
            <input className={`${inputCls} uppercase font-semibold`} value={codigo} onChange={(e) => setCodigo(e.target.value.toUpperCase().trim())} placeholder="ex.: IVVB11" />
          </Campo>
          <Campo label="Mercado">
            <select className={inputCls} value={mercado} onChange={(e) => setMercado(e.target.value as typeof mercado)}>
              <option value="brasil">Brasil</option>
              <option value="exterior">Exterior</option>
            </select>
          </Campo>
          <Campo label="Tipo" className="col-span-2">
            <select className={inputCls} value={tipo} onChange={(e) => setTipo(e.target.value as TipoAtivo)}>
              {TIPOS_ATIVO.map((t) => <option key={t.id} value={t.id}>{t.nome}</option>)}
            </select>
          </Campo>
          <Campo label="Bloco">
            <select className={inputCls} value={blocoId} onChange={(e) => setBlocoId(e.target.value)}>
              {blocos.map((b) => <option key={b.id} value={b.id}>{b.nome}</option>)}
            </select>
          </Campo>
          <Campo label="Alvo %">
            <DecimalInput value={alvo} ariaLabel="Alvo" onValue={setAlvo} />
          </Campo>
        </div>
        <p className="text-[11px] text-muted-foreground">
          {(alvo ?? 0) > 0
            ? `Com alvo de ${fmtNum(alvo ?? 0)}%, a soma dos alvos passa de 100%. Reduza o alvo de outros ativos em Configurações para fechar a conta.`
            : "Com alvo de 0%, o ativo entra na carteira mas aparece fora da banda até você definir o alvo em Configurações."}
          {mercado === "exterior" && " Para o exterior, informe o ticker da cotação (ex.: VALU.L) em Configurações."}
        </p>
        {erro && <p className="text-sm font-medium" style={{ color: VERMELHO }}>{erro}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onFechar} className="px-4 py-2 rounded-lg text-sm font-semibold border border-border hover:bg-secondary/50">Cancelar</button>
          <button type="button" onClick={salvar} disabled={salvando || !blocos.length}
            className="px-4 py-2 rounded-lg text-sm font-semibold text-white flex items-center gap-2 disabled:opacity-60" style={{ backgroundColor: ACCENT }}>
            {salvando && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Cadastrar
          </button>
        </div>
      </div>
    </div>
  );
}

