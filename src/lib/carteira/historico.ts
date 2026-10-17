// Gráficos da Visão geral (rentabilidade acumulada): carteira x CDI, Ibovespa e S&P 500, e cada ativo.
// Funções puras. Tudo é guardado como NÍVEL (índice acumulado, começando em 1): a tela escolhe o período e
// refaz a base (valor / valor no início − 1), então trocar o período não pede dados novos.
//
// Rentabilidade da carteira (encadeada dia a dia, sem efeito de aportes e retiradas):
//   r(t) = ( Σ cotas(t−1) × (preço(t) − preço(t−1)) + proventos(t) ) ÷ Σ cotas(t−1) × preço(t−1)
// Preços em reais (ativo do exterior: preço × câmbio do dia). Dia sem pregão repete o último preço.

export type PontoDia = { data: string; valor: number };

export type MovHistorico = {
  data: string;
  tipo: "compra" | "venda" | "provento";
  ativo_id: string;
  quantidade: number | null;
  valorBRL: number;             // só proventos: valor recebido em R$
};

// Preço (já em R$) de cada ativo por dia; null = ainda sem cotação naquele dia
export type PrecosPorAtivo = Record<string, (number | null)[]>;

// ── Utilidades de séries ───────────────────────────────────────────────────────

// Une as datas de várias séries, em ordem, dentro de [de, ate]
export function uniaoDeDatas(series: { data: string }[][], de: string, ate: string): string[] {
  const s = new Set<string>();
  for (const serie of series) for (const p of serie) if (p.data >= de && p.data <= ate) s.add(p.data);
  return [...s].sort();
}

// Alinha uma série às datas: repete o último valor conhecido; antes do primeiro, null
export function alinhar(datas: string[], serie: PontoDia[]): (number | null)[] {
  const ord = [...serie].sort((a, b) => a.data.localeCompare(b.data));
  let i = 0;
  let ultimo: number | null = null;
  return datas.map((d) => {
    while (i < ord.length && ord[i].data <= d) { ultimo = ord[i].valor; i++; }
    return ultimo;
  });
}

// Preço em R$ = preço × câmbio; sem câmbio (ou sem preço) no dia, null
export function emReais(preco: (number | null)[], cambio: (number | null)[] | null): (number | null)[] {
  return preco.map((p, i) => (p == null ? null : cambio ? (cambio[i] == null ? null : p * (cambio[i] as number)) : p));
}

// Índice de uma série de preços: preço(t) / preço no primeiro dia com valor (null antes)
export function indiceDePreco(precos: (number | null)[]): (number | null)[] {
  const base = precos.find((p) => p != null && p > 0);
  if (base == null) return precos.map(() => null);
  return precos.map((p) => (p == null ? null : p / base));
}

// CDI: o BCB publica a taxa DIÁRIA (% ao dia) só nos dias úteis; o índice acumula (1 + taxa/100)
export function indiceCdi(datas: string[], taxas: PontoDia[], inicio: string | null): (number | null)[] {
  const porData = new Map(taxas.map((t) => [t.data, t.valor]));
  let nivel = 1;
  return datas.map((d) => {
    if (inicio == null || d < inicio) return null;
    if (d > inicio) nivel *= 1 + (porData.get(d) ?? 0) / 100;
    return nivel;
  });
}

// ── Carteira ───────────────────────────────────────────────────────────────────

export type ResultadoCarteira = { indice: (number | null)[]; inicio: string | null };

export function indiceCarteira(datas: string[], movs: MovHistorico[], precos: PrecosPorAtivo): ResultadoCarteira {
  const ordenadas = [...movs].sort((a, b) => a.data.localeCompare(b.data));
  const cotas: Record<string, number> = {};
  const indice: (number | null)[] = [];
  let nivel: number | null = null;
  let inicio: string | null = null;
  let k = 0;
  // cotas no FIM do dia anterior (as operações de hoje só valem a partir de amanhã) e proventos do dia
  const aplicarAte = (d: string) => {
    let proventos = 0;
    while (k < ordenadas.length && ordenadas[k].data <= d) {
      const m = ordenadas[k++];
      if (m.tipo === "provento") proventos += m.valorBRL;
      else cotas[m.ativo_id] = (cotas[m.ativo_id] ?? 0) + (m.tipo === "compra" ? 1 : -1) * (m.quantidade ?? 0);
    }
    return proventos;
  };

  for (let t = 0; t < datas.length; t++) {
    const d = datas[t];
    if (t === 0) {
      aplicarAte(d); // as operações do primeiro dia valem como posição inicial; proventos dele não têm base de retorno
      indice.push(null);
      continue;
    }
    // valor da carteira de ontem com os preços de ontem e de hoje (só ativos com os dois preços)
    let vAnterior = 0;
    let ganho = 0;
    for (const [id, q] of Object.entries(cotas)) {
      const p0 = precos[id]?.[t - 1];
      const p1 = precos[id]?.[t];
      if (q <= 1e-9 || p0 == null || p1 == null) continue;
      vAnterior += q * p0;
      ganho += q * (p1 - p0);
    }
    const proventos = aplicarAte(d);
    if (vAnterior > 0) {
      if (nivel == null) { nivel = 1; inicio = datas[t - 1]; indice[t - 1] = 1; }
      nivel *= 1 + (ganho + proventos) / vAnterior;
      indice.push(nivel);
    } else {
      indice.push(nivel);
    }
  }
  return { indice, inicio };
}

// ── Período e base ─────────────────────────────────────────────────────────────

export type Periodo = "6m" | "12m" | "24m" | "36m" | "60m" | "120m" | "ano" | "tudo";

const MESES_DO_PERIODO: Partial<Record<Periodo, number>> = { "6m": 6, "12m": 12, "24m": 24, "36m": 36, "60m": 60, "120m": 120 };

// Data em que o período começaria hoje (sem limitar à primeira data da carteira); null para "tudo"
function inicioBruto(periodo: Periodo, hoje: string): string | null {
  const [y, m, d] = hoje.split("-").map(Number);
  if (periodo === "ano") return `${y}-01-01`;
  const meses = MESES_DO_PERIODO[periodo];
  if (meses == null) return null;
  return new Date(Date.UTC(y, m - 1 - meses, d)).toISOString().slice(0, 10);
}

export function inicioDoPeriodo(periodo: Periodo, hoje: string, primeiraData: string): string {
  const alvo = inicioBruto(periodo, hoje) ?? primeiraData;
  return alvo > primeiraData ? alvo : primeiraData;
}

// O período cabe no histórico da carteira? (um período mais longo que o histórico seria igual a "Desde o início")
// `primeiraData` é o primeiro dia com dados; a folga de 15 dias evita recusar "10 anos" por uma diferença de calendário.
export function periodoCabe(periodo: Periodo, hoje: string, primeiraData: string): boolean {
  if (periodo === "tudo") return true;
  const bruto = inicioBruto(periodo, hoje);
  if (bruto == null) return false;
  const limite = new Date(Date.parse(primeiraData) - 15 * 86400000).toISOString().slice(0, 10);
  return bruto >= limite;
}

// Refaz a base no primeiro dia a partir de `inicio` em que TODAS as séries pedidas têm valor
// (a comparação precisa partir do mesmo dia). Devolve o retorno acumulado em % (0 = início).
export function rebase(datas: string[], series: (number | null)[][], inicio: string): { datas: string[]; series: (number | null)[][] } {
  const s = datas.findIndex((d) => d >= inicio);
  if (s < 0) return { datas: [], series: series.map(() => []) };
  // avança até todas terem valor (ativo comprado depois de `inicio` começa mais tarde, na própria linha)
  const comValor = (i: number, n: (number | null)[]) => n[i] != null;
  const base = series.map((n) => {
    let i = s;
    while (i < datas.length && !comValor(i, n)) i++;
    return i < datas.length ? { i, v: n[i] as number } : null;
  });
  return {
    datas: datas.slice(s),
    series: series.map((n, k) => {
      const b = base[k];
      return n.slice(s).map((v, j) => (b == null || v == null || s + j < b.i ? null : (v / b.v - 1) * 100));
    }),
  };
}

// Mesma base para todas as linhas: a da carteira define o início (ou o 1º dia do período)
export function rebaseComum(datas: string[], series: (number | null)[][], inicio: string, ancora: (number | null)[]): { datas: string[]; series: (number | null)[][] } {
  let s = datas.findIndex((d) => d >= inicio);
  while (s >= 0 && s < datas.length && ancora[s] == null) s++;
  if (s < 0 || s >= datas.length) return { datas: [], series: series.map(() => []) };
  return {
    datas: datas.slice(s),
    series: series.map((n) => {
      const v0 = n[s];
      return n.slice(s).map((v) => (v0 == null || v == null ? null : (v / v0 - 1) * 100));
    }),
  };
}

// ── Eixo ───────────────────────────────────────────────────────────────────────

// Marcas "bonitas" para o eixo vertical (inclui o zero quando o intervalo o cruza)
export function marcasDoEixo(min: number, max: number, alvo = 5): number[] {
  if (!(max > min)) { max = min + 1; }
  const bruto = (max - min) / Math.max(1, alvo - 1);
  const pot = 10 ** Math.floor(Math.log10(bruto));
  const f = bruto / pot;
  const passo = (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * pot;
  const ini = Math.floor(min / passo) * passo;
  const marcas: number[] = [];
  for (let v = ini; v <= max + passo * 0.999; v += passo) marcas.push(Math.round(v / passo * 1e6) / 1e6 * passo);
  return marcas;
}
