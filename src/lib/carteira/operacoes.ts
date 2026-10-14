// Custos, cotas, preço médio, IR estimado, efeito na carteira e sugestões
// (docs/carteira/REGRAS.md §1, §5, §6 e §7). Funções puras; percentuais em pontos (1.25 = 1,25%).

import { bandaEfetiva, foraDaBanda } from "@/lib/carteira/regras";

export type CustosCorretora = {
  corr_br_pct: number; corr_br_min: number;
  corr_ext_pct: number; corr_ext_min_usd: number;
  emolumentos_pct: number;
  spread_pct: number; iof_ida_pct: number; iof_volta_pct: number;
};

const r2 = (v: number) => Math.round(v * 100) / 100;

// Corretagem de uma ordem em R$ (exterior: mínimo em US$ convertido pelo dólar do dia)
export function corretagem(valor: number, exterior: boolean, c: CustosCorretora, dolar: number): number {
  if (valor <= 0) return 0;
  return exterior
    ? Math.max((valor * c.corr_ext_pct) / 100, c.corr_ext_min_usd * dolar)
    : Math.max((valor * c.corr_br_pct) / 100, c.corr_br_min);
}

// ── Compra ─────────────────────────────────────────────────────────────────────

export type CompraCalculada = {
  cotas: number;
  ordem: number;          // R$ efetivamente aplicados no ativo (valor investido)
  ordemMoeda: number;     // na moeda do ativo (= cotas × preço)
  spread: number; iof: number; corretagem: number; emolumentos: number;
  desembolso: number;     // R$ que saem da conta (valor líquido da operação)
};

// Exterior (REGRAS §5): v = R$ que saem da conta; remessa = v × (spread + IOF ida);
// corretagem = max((v − remessa) × %ext, mín US$ × dólar); investido = v − remessa − corretagem.
// Cotas fracionadas (4 casas). B3: cotas inteiras, a maior quantidade cujo custo cabe em v.
export function calcularCompra({
  valor, preco, cambio, exterior, corretora, dolar,
}: {
  valor: number; preco: number; cambio: number; exterior: boolean; corretora: CustosCorretora; dolar: number;
}): CompraCalculada {
  const vazio = { cotas: 0, ordem: 0, ordemMoeda: 0, spread: 0, iof: 0, corretagem: 0, emolumentos: 0, desembolso: 0 };
  if (!(valor > 0) || !(preco > 0) || !(cambio > 0)) return vazio;

  if (exterior) {
    const spread = (valor * corretora.spread_pct) / 100;
    const iof = (valor * corretora.iof_ida_pct) / 100;
    const corr = corretagem(valor - spread - iof, true, corretora, dolar);
    const investido = valor - spread - iof - corr;
    if (investido <= 0) return vazio;
    // tolerância: 389,81879999… (ponto flutuante) deve virar 389,8188, não 389,8187
    const cotas = Math.floor((investido / cambio / preco) * 10000 + 1e-6) / 10000;
    return {
      cotas, ordem: r2(investido), ordemMoeda: r2(cotas * preco),
      spread: r2(spread), iof: r2(iof), corretagem: r2(corr), emolumentos: 0, desembolso: r2(valor),
    };
  }

  const custo = (q: number) => {
    const ordem = q * preco;
    return { ordem, corr: corretagem(ordem, false, corretora, dolar), emol: (ordem * corretora.emolumentos_pct) / 100 };
  };
  let cotas = Math.floor(valor / preco);
  while (cotas > 0) {
    const c = custo(cotas);
    if (c.ordem + c.corr + c.emol <= valor + 1e-9) break;
    cotas--;
  }
  if (cotas <= 0) return vazio;
  const c = custo(cotas);
  return {
    cotas, ordem: r2(c.ordem), ordemMoeda: r2(c.ordem), spread: 0, iof: 0,
    corretagem: r2(c.corr), emolumentos: r2(c.emol), desembolso: r2(c.ordem + c.corr + c.emol),
  };
}

// ── Venda ──────────────────────────────────────────────────────────────────────

export type VendaCalculada = {
  bruto: number;          // R$ (cotas × preço × câmbio)
  brutoMoeda: number;
  corretagem: number; emolumentos: number;
  cambioRetorno: number;  // spread + IOF de volta (exterior)
  spread: number; iof: number; // as duas partes do câmbio no retorno
  ganho: number;          // sobre o preço médio, já descontados os custos da venda
  ir: number;
  liquido: number;        // R$ que entram na conta
};

// Exterior (REGRAS §5): corretagem = max(v × %ext, mín US$ × dólar); câmbio = (v − corretagem) × (spread + IOF volta);
// líquido = v − IR − corretagem − câmbio. B3: corretagem + emolumentos, sem câmbio.
// IR estimado (§7): alíquota × ganho sobre o preço médio em R$ (nunca negativo).
export function calcularVenda({
  cotas, preco, cambio, exterior, corretora, dolar, precoMedioBRL, aliquotaPct,
}: {
  cotas: number; preco: number; cambio: number; exterior: boolean; corretora: CustosCorretora; dolar: number;
  precoMedioBRL: number; aliquotaPct: number;
}): VendaCalculada {
  if (!(cotas > 0) || !(preco > 0) || !(cambio > 0)) {
    return { bruto: 0, brutoMoeda: 0, corretagem: 0, emolumentos: 0, cambioRetorno: 0, spread: 0, iof: 0, ganho: 0, ir: 0, liquido: 0 };
  }
  const brutoMoeda = cotas * preco;
  const bruto = brutoMoeda * cambio;
  const corr = corretagem(bruto, exterior, corretora, dolar);
  const emol = exterior ? 0 : (bruto * corretora.emolumentos_pct) / 100;
  const spread = exterior ? ((bruto - corr) * corretora.spread_pct) / 100 : 0;
  const iof = exterior ? ((bruto - corr) * corretora.iof_volta_pct) / 100 : 0;
  const cambioRetorno = spread + iof;
  const ganho = bruto - corr - emol - cambioRetorno - precoMedioBRL * cotas;
  const ir = Math.max(0, ganho) * (aliquotaPct / 100);
  return {
    bruto: r2(bruto), brutoMoeda: r2(brutoMoeda), corretagem: r2(corr), emolumentos: r2(emol),
    cambioRetorno: r2(cambioRetorno), spread: r2(spread), iof: r2(iof), ganho: r2(ganho), ir: r2(ir),
    liquido: r2(bruto - corr - emol - cambioRetorno - ir),
  };
}

// ── Preço médio (§7) ───────────────────────────────────────────────────────────

export type MovPM = {
  data: string;
  tipo: "compra" | "venda" | "provento";
  quantidade: number | null;
  valor_liquido_brl: number; // compra: custo total em R$ (com corretagem, emolumentos, spread e IOF)
};

// Custo total de aquisição ÷ quantidade, ponderado a cada compra. Vendas não mudam o preço médio.
export function precoMedio(movs: MovPM[], ateData?: string): { quantidade: number; custo: number; pm: number } {
  let quantidade = 0, custo = 0;
  const ordenadas = [...movs].filter((m) => !ateData || m.data <= ateData).sort((a, b) => a.data.localeCompare(b.data));
  for (const m of ordenadas) {
    if (m.tipo === "provento" || m.quantidade == null) continue;
    if (m.tipo === "compra") {
      quantidade += m.quantidade;
      custo += m.valor_liquido_brl;
    } else if (quantidade > 0) {
      const pm = custo / quantidade;
      const q = Math.min(m.quantidade, quantidade);
      quantidade -= q;
      custo -= pm * q;
    }
  }
  if (quantidade < 1e-9) return { quantidade: 0, custo: 0, pm: 0 };
  return { quantidade, custo, pm: custo / quantidade };
}

// ── Efeito na carteira ─────────────────────────────────────────────────────────

export type AtivoEfeito = { id: string; codigo: string; alvo_pct: number; banda_pp: number | null };
export type LinhaEfeito = {
  id: string; codigo: string; alvo: number; antes: number; depois: number; banda: number;
  statusAntes: Status; statusDepois: Status; foco: boolean;
};
export type Status = "dentro" | "acima" | "abaixo";

export function statusBanda(realPct: number, alvoPct: number, bandaPp: number): Status {
  if (!foraDaBanda(realPct, alvoPct, bandaPp)) return "dentro";
  return realPct > alvoPct ? "acima" : "abaixo";
}

// Percentual de cada ativo antes e depois de somar `deltas` (R$) aos valores atuais
export function efeitoNaCarteira(
  ativos: AtivoEfeito[], valores: Record<string, number>, deltas: Record<string, number>, foco: string[],
): LinhaEfeito[] {
  const totalAntes = ativos.reduce((s, a) => s + (valores[a.id] ?? 0), 0);
  const totalDepois = totalAntes + Object.values(deltas).reduce((s, d) => s + d, 0);
  return ativos.map((a) => {
    const antes = totalAntes > 0 ? ((valores[a.id] ?? 0) / totalAntes) * 100 : 0;
    const depois = totalDepois > 0 ? (((valores[a.id] ?? 0) + (deltas[a.id] ?? 0)) / totalDepois) * 100 : 0;
    const banda = bandaEfetiva(a.alvo_pct, a.banda_pp);
    return {
      id: a.id, codigo: a.codigo, alvo: a.alvo_pct, antes, depois, banda,
      statusAntes: statusBanda(antes, a.alvo_pct, banda), statusDepois: statusBanda(depois, a.alvo_pct, banda),
      foco: foco.includes(a.id),
    };
  });
}

// ── Sugestões ──────────────────────────────────────────────────────────────────

export type AtivoSugestao = AtivoEfeito & { mercado: "brasil" | "exterior" };

// Aporte: o ativo com menor razão real/alvo. "Faltam R$ X" = (alvo − real) × patrimônio
export function sugestaoAporte(ativos: AtivoSugestao[], valores: Record<string, number>) {
  const total = ativos.reduce((s, a) => s + (valores[a.id] ?? 0), 0);
  const comAlvo = ativos.filter((a) => a.alvo_pct > 0);
  if (!comAlvo.length) return null;
  const real = (a: AtivoSugestao) => (total > 0 ? ((valores[a.id] ?? 0) / total) * 100 : 0);
  const a = [...comAlvo].sort((x, y) => real(x) / x.alvo_pct - real(y) / y.alvo_pct)[0];
  return { ativo: a, real: real(a), falta: Math.max(0, ((a.alvo_pct - real(a)) / 100) * total) };
}

// Venda: o ativo negociado no Brasil mais acima do alvo; excesso até a borda da banda (§1)
export function sugestaoVenda(ativos: AtivoSugestao[], valores: Record<string, number>) {
  const total = ativos.reduce((s, a) => s + (valores[a.id] ?? 0), 0);
  if (total <= 0) return null;
  const real = (a: AtivoSugestao) => ((valores[a.id] ?? 0) / total) * 100;
  const br = ativos.filter((a) => a.mercado === "brasil" && a.alvo_pct > 0 && (valores[a.id] ?? 0) > 0);
  if (!br.length) return null;
  const a = [...br].sort((x, y) => real(y) / y.alvo_pct - real(x) / x.alvo_pct)[0];
  return { ativo: a, real: real(a), excesso: excessoAteBorda(real(a), a.alvo_pct, bandaEfetiva(a.alvo_pct, a.banda_pp), total) };
}

// excesso = (real − (alvo + banda)) × patrimônio, quando positivo
export function excessoAteBorda(realPct: number, alvoPct: number, bandaPp: number, total: number): number {
  return Math.max(0, ((realPct - (alvoPct + bandaPp)) / 100) * total);
}

// ── Custos de aquisição ────────────────────────────────────────────────────────

export type MovCustos = {
  data: string; tipo: "compra" | "venda" | "provento";
  valor_liquido_brl: number; spread_valor: number; iof_valor: number; corretagem: number; emolumentos: number; outras_taxas: number;
};

// Compras do período: quanto saiu da conta, quanto virou investimento e quanto foi para cada custo
export function custosAquisicao(movs: MovCustos[], ano: number | null) {
  const compras = movs.filter((m) => m.tipo === "compra" && (ano == null || Number(m.data.slice(0, 4)) === ano));
  const soma = (k: keyof MovCustos) => compras.reduce((s, m) => s + Number(m[k] ?? 0), 0);
  const bruto = soma("valor_liquido_brl");
  const spread = soma("spread_valor"), iof = soma("iof_valor");
  const corr = soma("corretagem") + soma("emolumentos") + soma("outras_taxas");
  return { bruto, spread, iof, corretagem: corr, liquido: bruto - spread - iof - corr, operacoes: compras.length };
}
