// Patrimônio a partir das movimentações e das cotações (REGRAS.md §6). Funções puras.
//
// Patrimônio = Σ cotas × cotação × câmbio do dia (ativos fora de BRL).
// Investido líquido = compras − vendas − proventos. Ganho = patrimônio − investido líquido.

import { tickerCambio } from "@/lib/market/normalizar";

export type MovimentacaoBase = {
  ativo_id: string;
  tipo: "compra" | "venda" | "provento";
  quantidade: number | null;
  valor_liquido_brl: number;
};

export type Cotacao = {
  ticker: string;
  data: string;            // YYYY-MM-DD
  fechamento: number;
  moeda: string | null;
  intradiaria: boolean;
  atualizado_em: string;   // ISO
};

export type AtivoAvaliavel = { id: string; codigo: string; ticker_cotacao: string | null; moeda: string };

export type ItemAvaliado = {
  ativo_id: string;
  codigo: string;
  quantidade: number;
  preco: number | null;        // na moeda da cotação
  moedaPreco: string | null;
  cambio: number | null;       // R$ por unidade da moeda da cotação
  valor: number;               // R$
  data: string | null;
  aviso: string | null;
};

export function quantidadesPorAtivo(movs: MovimentacaoBase[]): Record<string, number> {
  const q: Record<string, number> = {};
  for (const m of movs) {
    if (m.tipo === "provento" || m.quantidade == null) continue;
    q[m.ativo_id] = (q[m.ativo_id] ?? 0) + (m.tipo === "compra" ? m.quantidade : -m.quantidade);
  }
  return q;
}

export function investidoLiquido(movs: MovimentacaoBase[]): number {
  return movs.reduce((s, m) => s + (m.tipo === "compra" ? m.valor_liquido_brl : -m.valor_liquido_brl), 0);
}

// Câmbios em R$ por moeda, a partir das cotações USDBRL=X, EURBRL=X...
export function cambiosDasCotacoes(cotacoes: Record<string, Cotacao>): Record<string, number> {
  const c: Record<string, number> = { BRL: 1 };
  for (const [ticker, cot] of Object.entries(cotacoes)) {
    const m = /^([A-Z]{3})BRL=X$/.exec(ticker);
    if (m) c[m[1]] = cot.fechamento;
  }
  return c;
}

export function avaliarCarteira(
  ativos: AtivoAvaliavel[],
  quantidades: Record<string, number>,
  cotacoes: Record<string, Cotacao>,
): { total: number; itens: ItemAvaliado[] } {
  const cambios = cambiosDasCotacoes(cotacoes);
  const itens = ativos.map((a): ItemAvaliado => {
    const quantidade = quantidades[a.id] ?? 0;
    const base = { ativo_id: a.id, codigo: a.codigo, quantidade, preco: null, moedaPreco: null, cambio: null, valor: 0, data: null };
    if (Math.abs(quantidade) < 1e-9) return { ...base, quantidade: 0, aviso: null };
    if (!a.ticker_cotacao) return { ...base, aviso: "Sem ticker de cotação" };
    const cot = cotacoes[a.ticker_cotacao];
    if (!cot) return { ...base, aviso: "Sem cotação" };
    const moeda = cot.moeda ?? a.moeda;
    const cambio = cambios[moeda] ?? null;
    if (cambio == null) {
      return { ...base, preco: cot.fechamento, moedaPreco: moeda, data: cot.data, aviso: `Sem câmbio ${moeda}/BRL` };
    }
    const aviso = cot.moeda && cot.moeda !== a.moeda ? `Cotação em ${cot.moeda}, ativo cadastrado em ${a.moeda}` : null;
    return {
      ...base, preco: cot.fechamento, moedaPreco: moeda, cambio, data: cot.data,
      valor: quantidade * cot.fechamento * cambio, aviso,
    };
  });
  return { total: itens.reduce((s, i) => s + i.valor, 0), itens };
}

// Tickers necessários para avaliar: os dos ativos + câmbio de cada moeda fora de BRL (USD sempre, para o menu)
export function tickersNecessarios(ativos: { ticker_cotacao: string | null; moeda: string }[]): string[] {
  const t = new Set<string>(["USDBRL=X"]);
  for (const a of ativos) {
    if (a.ticker_cotacao) t.add(a.ticker_cotacao);
    const fx = tickerCambio(a.moeda);
    if (fx) t.add(fx);
  }
  return [...t].sort();
}
