import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchYahooChart } from "@/lib/market/yahoo";
import { fetchPtaxPeriodo, fetchSgsRange, SGS_IPCA_MENSAL } from "@/lib/market/bcb";
import {
  avaliarCarteira, investidoLiquido, quantidadesPorAtivo, tickersNecessarios,
  type Cotacao, type MovimentacaoBase,
} from "@/lib/carteira/patrimonio";

// Dados de mercado da Carteira (DADOS.md, "Fontes"). Gravação com o cliente service_role;
// leitura com qualquer cliente logado. A tela sempre usa a última cotação válida salva.

export const hojeSP = () => new Date().toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });

function diasAntes(iso: string, dias: number): string {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - dias);
  return d.toISOString().slice(0, 10);
}

// ── Gravação ───────────────────────────────────────────────────────────────────

export async function atualizarCotacoes(
  admin: SupabaseClient, tickers: string[], range = "5d",
): Promise<{ ok: string[]; falhas: string[] }> {
  const ok: string[] = [], falhas: string[] = [];
  const agora = new Date().toISOString();
  // Em lotes, para não abrir dezenas de conexões ao Yahoo de uma vez
  for (let i = 0; i < tickers.length; i += 6) {
    await Promise.all(tickers.slice(i, i + 6).map(async (ticker) => {
      const chart = await fetchYahooChart(ticker, { range });
      if (!chart || !chart.dias.length) { falhas.push(ticker); return; }
      const linhas = chart.dias.map((d, idx, arr) => ({
        ticker, data: d.data, fechamento: d.fechamento, volume: d.volume, moeda: chart.moeda, fonte: "yahoo",
        intradiaria: chart.pregaoAberto && idx === arr.length - 1, atualizado_em: agora,
      }));
      const { error } = await admin.from("mercado_cotacoes").upsert(linhas, { onConflict: "ticker,data" });
      (error ? falhas : ok).push(ticker);
    }));
  }
  return { ok, falhas };
}

export async function atualizarPtax(admin: SupabaseClient, dias = 15): Promise<number> {
  const fim = hojeSP();
  const ptax = await fetchPtaxPeriodo(diasAntes(fim, dias), fim);
  if (!ptax?.length) return 0;
  const { error } = await admin.from("mercado_ptax").upsert(ptax, { onConflict: "data" });
  if (error) throw new Error(`PTAX: ${error.message}`);
  return ptax.length;
}

export async function atualizarIpca(admin: SupabaseClient, meses = 24): Promise<number> {
  const fim = hojeSP();
  const serie = await fetchSgsRange(SGS_IPCA_MENSAL, diasAntes(fim, meses * 31), fim);
  if (!serie?.length) return 0;
  const linhas = serie.map((p) => ({ competencia: `${p.date.slice(0, 7)}-01`, variacao_pct: p.valor }));
  const { error } = await admin.from("mercado_ipca").upsert(linhas, { onConflict: "competencia" });
  if (error) throw new Error(`IPCA: ${error.message}`);
  return linhas.length;
}

// ── Leitura ────────────────────────────────────────────────────────────────────

// Última cotação válida de cada ticker até a data (olha até 30 dias para trás)
export async function lerCotacoes(
  supabase: SupabaseClient, tickers: string[], ateData = hojeSP(),
): Promise<Record<string, Cotacao>> {
  if (!tickers.length) return {};
  const { data, error } = await supabase
    .from("mercado_cotacoes")
    .select("ticker, data, fechamento, moeda, intradiaria, atualizado_em")
    .in("ticker", tickers)
    .lte("data", ateData)
    .gte("data", diasAntes(ateData, 30))
    .order("data", { ascending: false })
    .range(0, 4999);
  if (error) throw new Error(error.message);
  const ultima: Record<string, Cotacao> = {};
  for (const r of data ?? []) {
    if (!ultima[r.ticker]) ultima[r.ticker] = { ...r, fechamento: Number(r.fechamento) } as Cotacao;
  }
  return ultima;
}

export async function lerMovimentacoes(supabase: SupabaseClient, profileId: string, ateData?: string): Promise<MovimentacaoBase[]> {
  let q = supabase
    .from("carteira_movimentacoes")
    .select("ativo_id, tipo, quantidade, valor_liquido_brl")
    .eq("profile_id", profileId);
  if (ateData) q = q.lte("data", ateData);
  const { data, error } = await q.range(0, 49999);
  if (error) throw new Error(error.message);
  return (data ?? []).map((m) => ({
    ativo_id: m.ativo_id, tipo: m.tipo,
    quantidade: m.quantidade == null ? null : Number(m.quantidade),
    valor_liquido_brl: Number(m.valor_liquido_brl),
  }));
}

// PTAX do dia da operação (para o IR): a do dia ou a última anterior, até 7 dias antes.
// Usa a tabela; se faltar, consulta o BCB na hora (não precisa da chave service_role).
export async function ptaxDoDia(supabase: SupabaseClient, data: string): Promise<{ compra: number; venda: number } | null> {
  const { data: linha } = await supabase
    .from("mercado_ptax")
    .select("compra, venda")
    .lte("data", data)
    .gte("data", diasAntes(data, 7))
    .order("data", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (linha) return { compra: Number(linha.compra), venda: Number(linha.venda) };
  const bcb = await fetchPtaxPeriodo(diasAntes(data, 7), data);
  const ultima = bcb?.filter((p) => p.data <= data).sort((a, b) => a.data.localeCompare(b.data)).at(-1);
  return ultima ? { compra: ultima.compra, venda: ultima.venda } : null;
}

// ── Rotina diária ──────────────────────────────────────────────────────────────

// Fotos do patrimônio de todas as carteiras com movimentações, na data dada
export async function gravarSnapshots(admin: SupabaseClient, data = hojeSP()): Promise<number> {
  const { data: ativos, error } = await admin
    .from("carteira_ativos")
    .select("id, profile_id, codigo, ticker_cotacao, moeda")
    .range(0, 49999);
  if (error) throw new Error(error.message);

  const porPerfil = new Map<string, NonNullable<typeof ativos>>();
  for (const a of ativos ?? []) porPerfil.set(a.profile_id, [...(porPerfil.get(a.profile_id) ?? []), a]);

  const cotacoes = await lerCotacoes(admin, tickersNecessarios(ativos ?? []), data);
  let gravadas = 0;
  for (const [profileId, lista] of porPerfil) {
    const movs = await lerMovimentacoes(admin, profileId, data);
    if (!movs.length) continue;
    const { total } = avaliarCarteira(lista, quantidadesPorAtivo(movs), cotacoes);
    const { error: e } = await admin.from("carteira_snapshots").upsert({
      profile_id: profileId, data, patrimonio_brl: Math.round(total * 100) / 100,
      investido_liquido: Math.round(investidoLiquido(movs) * 100) / 100,
    }, { onConflict: "profile_id,data" });
    if (e) throw new Error(`Snapshot: ${e.message}`);
    gravadas++;
  }
  return gravadas;
}

// Todos os tickers cadastrados (distintos), mais o câmbio de cada moeda usada
export async function tickersDeTodasAsCarteiras(admin: SupabaseClient): Promise<string[]> {
  const { data, error } = await admin.from("carteira_ativos").select("ticker_cotacao, moeda").range(0, 49999);
  if (error) throw new Error(error.message);
  return tickersNecessarios(data ?? []);
}
