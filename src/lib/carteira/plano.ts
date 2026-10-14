// Plano: projeção anual em valores reais, túnel, perpetuidade e correção pela inflação
// (docs/carteira/REGRAS.md §2). Funções puras; percentuais em pontos (3.5 = 3,5%).

import { retiradaMaxPerpetua, vereditoPerpetuidade, type Veredito } from "@/lib/carteira/regras";

export const ANOS_PERPETUO = 40; // no usufruto perpétuo o gráfico exibe 40 anos

export type Premissas = {
  ano_inicio: number;
  patrimonio_inicial: number;
  aporte_mensal: number;
  anos_aporte: number;
  perpetuo: boolean;
  anos_usufruto: number | null;
  retirada_pct: number;
  rent_pess_pct: number;
  rent_otim_pct: number;
};

export type VersaoPlano = Premissas & {
  id: string; versao: number; em_uso: boolean; criado_em: string; atualizado_em: string;
};

// A pessimista nunca passa de otimista − 0,5 (o túnel precisa ter largura)
export const rentPessEfetiva = (pess: number, otim: number) => Math.min(pess, otim - 0.5);

export const anosUsufruto = (p: Premissas) => (p.perpetuo ? ANOS_PERPETUO : p.anos_usufruto ?? 0);
export const horizonte = (p: Premissas) => p.anos_aporte + anosUsufruto(p);

export type Projecao = {
  valores: number[];   // v[t]: patrimônio no início do ano t (t = 0 é o início do plano), em valores reais
  saqueAnual: number;  // W: fixo em termos reais, definido no início do usufruto
  esgota: number;      // primeiro t em que v[t] − W ≤ 0 (−1 se nunca)
};

// Acumulação (t < anosAporte): v[t+1] = (v[t] + aporteMensal×12) × (1 + r)
// Usufruto: W = v[anosAporte] × retirada%; saque = min(W, v[t]); v[t+1] = max(0, (v[t] − saque) × (1 + r))
export function projetar(p: Premissas, rentPct: number): Projecao {
  const r = rentPct / 100;
  const T = horizonte(p);
  const v = [p.patrimonio_inicial];
  let W = 0;
  let esgota = -1;
  for (let t = 0; t < T; t++) {
    let cur = v[t];
    if (t < p.anos_aporte) {
      cur = (cur + p.aporte_mensal * 12) * (1 + r);
    } else {
      if (t === p.anos_aporte) W = (v[t] * p.retirada_pct) / 100;
      const saque = Math.min(W, cur);
      if (esgota < 0 && cur - W <= 0) esgota = t;
      cur = Math.max(0, (cur - saque) * (1 + r));
    }
    v.push(cur);
  }
  return { valores: v, saqueAnual: W, esgota };
}

export type Tunel = { pess: Projecao; otim: Projecao };

export function projetarTunel(p: Premissas): Tunel {
  return {
    pess: projetar(p, rentPessEfetiva(p.rent_pess_pct, p.rent_otim_pct)),
    otim: projetar(p, p.rent_otim_pct),
  };
}

// ── Inflação (IPCA) ────────────────────────────────────────────────────────────

export type IpcaMes = { competencia: string; variacao_pct: number }; // competência: AAAA-MM-01

// Fator acumulado dos meses inteiros já encerrados entre 1º de janeiro de anoInicio e `ateISO`
export function fatorIpcaAte(ipca: IpcaMes[], anoInicio: number, ateISO: string): number {
  const ini = `${anoInicio}-01-01`;
  const fim = `${ateISO.slice(0, 7)}-01`; // o mês corrente ainda não fechou
  return ipca
    .filter((m) => m.competencia >= ini && m.competencia < fim)
    .reduce((f, m) => f * (1 + m.variacao_pct / 100), 1);
}

// F[t] = inflação acumulada desde o início do plano até o início do ano t. Depois de hoje não há
// inflação futura: o fator para de crescer (o plano segue em valores reais, sem premissa nova).
export function fatoresPorAno(ipca: IpcaMes[], anoInicio: number, hojeISO: string, nAnos: number): number[] {
  return Array.from({ length: nAnos + 1 }, (_, t) => {
    const data = `${anoInicio + t}-01-01`;
    return fatorIpcaAte(ipca, anoInicio, data < hojeISO ? data : hojeISO);
  });
}

// Valor de uma série anual em um instante fracionário (interpolação linear)
export function interpolar(serie: number[], t: number): number {
  if (!serie.length) return 0;
  if (t <= 0) return serie[0];
  if (t >= serie.length - 1) return serie[serie.length - 1];
  const i = Math.floor(t);
  return serie[i] + (serie[i + 1] - serie[i]) * (t - i);
}

// Anos (fracionários) desde 1º de janeiro de anoInicio até o FIM do dia indicado (as cotações e as
// fotos do patrimônio são de fechamento): 31/12 de um ano dá exatamente um número inteiro.
export function anosDesde(anoInicio: number, iso: string): number {
  const [y, m, d] = iso.split("-").map(Number);
  const diaDoAno = (Date.UTC(y, m - 1, d) - Date.UTC(y, 0, 1)) / 86400000 + 1;
  const diasNoAno = (Date.UTC(y + 1, 0, 1) - Date.UTC(y, 0, 1)) / 86400000;
  return y - anoInicio + diaDoAno / diasNoAno;
}

// O túnel em reais correntes: cada ano do plano (em valores reais) × fator de inflação do ano
export const corrigir = (valores: number[], fatores: number[]) => valores.map((v, t) => v * (fatores[t] ?? fatores.at(-1) ?? 1));

// ── Status, textos e totais ────────────────────────────────────────────────────

export type StatusTunel = { tipo: "dentro" | "abaixo" | "acima" | "fora"; diferenca: number };

export function statusTunel(patrimonio: number, faixa: { pess: number; otim: number } | null): StatusTunel {
  if (!faixa) return { tipo: "fora", diferenca: 0 };
  if (patrimonio < faixa.pess) return { tipo: "abaixo", diferenca: faixa.pess - patrimonio };
  if (patrimonio > faixa.otim) return { tipo: "acima", diferenca: patrimonio - faixa.otim };
  return { tipo: "dentro", diferenca: 0 };
}

export function textoVeredito(v: Veredito, p: Premissas, pessMensal: number): { titulo: string; texto: string } {
  const pess = rentPessEfetiva(p.rent_pess_pct, p.rent_otim_pct);
  const max = retiradaMaxPerpetua(pess);
  const pct = (x: number, c = 1) => `${x.toLocaleString("pt-BR", { minimumFractionDigits: c, maximumFractionDigits: c })}%`;
  const brl = (x: number) => `R$ ${Math.round(x).toLocaleString("pt-BR")}`;
  const maxMensal = `${brl((pessMensal * max) / p.retirada_pct)} por mês`;
  if (v === "verde") {
    return {
      titulo: "Perpétua mesmo no cenário pessimista",
      texto: `Com retirada de ${pct(p.retirada_pct, 2)} ao ano, o patrimônio se mantém em termos reais mesmo rendendo ${pct(pess, 1)} acima da inflação.`,
    };
  }
  if (v === "amarelo") {
    return {
      titulo: "Perpétua só no cenário otimista",
      texto: `No cenário pessimista o patrimônio diminui aos poucos. Para ser perpétua também nele, a retirada máxima é ${pct(max)} ao ano (${maxMensal}).`,
    };
  }
  return {
    titulo: "Não é perpétua",
    texto: `A retirada é maior que o rendimento real nos dois cenários. Para ser perpétua no pessimista, a retirada máxima é ${pct(max)} ao ano (${maxMensal}).`,
  };
}

export { vereditoPerpetuidade };

// Frase de sustentabilidade (protótipo): o que acontece com o patrimônio no fim do período exibido
export function fraseSustentabilidade(p: Premissas, t: Tunel, fator: number): { texto: string; tom: "verde" | "ambar" | "vermelho" } {
  const A = p.anos_aporte, T = horizonte(p);
  const fim = p.ano_inicio + T;
  const money = (v: number) => (v >= 1e6 ? `R$ ${(v / 1e6).toLocaleString("pt-BR", { maximumFractionDigits: v >= 1e7 ? 0 : 1 })} mi` : `R$ ${Math.round(v / 1000)} mil`);
  if (t.pess.esgota >= 0) {
    return {
      texto: `No cenário pessimista o patrimônio se esgota em ${p.ano_inicio + t.pess.esgota + 1}, antes do fim do período exibido. Reduza a retirada, aumente os aportes ou os anos de aporte.`,
      tom: "vermelho",
    };
  }
  const lo = t.pess.valores[T] * fator, hi = t.otim.valores[T] * fator;
  const faixa = `Em ${fim} o patrimônio fica entre ${money(lo)} e ${money(hi)}`;
  if (t.pess.valores[T] < t.pess.valores[A]) {
    return { texto: `${faixa}. No cenário pessimista ele diminui ao longo do usufruto, mas não se esgota.`, tom: "ambar" };
  }
  return { texto: `${faixa}: mesmo no cenário pessimista ele se mantém ou cresce.`, tom: "verde" };
}

export function descreverMudancas(a: Premissas, b: Premissas): string[] {
  const nomes: [keyof Premissas, string][] = [
    ["ano_inicio", "ano de início"], ["patrimonio_inicial", "patrimônio inicial"], ["aporte_mensal", "aporte mensal"],
    ["anos_aporte", "anos de aporte"], ["anos_usufruto", "anos de usufruto"], ["retirada_pct", "retirada"],
    ["rent_pess_pct", "rentabilidade pessimista"], ["rent_otim_pct", "rentabilidade otimista"], ["perpetuo", "tipo de usufruto"],
  ];
  return nomes.filter(([k]) => (a[k] ?? null) !== (b[k] ?? null)).map(([, n]) => n);
}

export const resumoPremissas = (p: Premissas) => {
  const brl = (x: number) => `R$ ${Math.round(x).toLocaleString("pt-BR")}`;
  const pct = (x: number) => `${x.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%`;
  return `Aporte ${brl(p.aporte_mensal)}/mês por ${p.anos_aporte} anos · retirada ${pct(p.retirada_pct)} · rentabilidade ${pct(p.rent_pess_pct)} a ${pct(p.rent_otim_pct)} a.a.`;
};

// Valores como no protótipo: "R$ 850 mil", "R$ 1,2 mi"
export function dinheiroCurto(v: number): string {
  if (v >= 1e6) return `R$ ${(v / 1e6).toLocaleString("pt-BR", { maximumFractionDigits: v >= 1e7 ? 0 : 1 })} mi`;
  return `R$ ${Math.round(v / 1000)} mil`;
}

// ── Séries a partir das fotos diárias do patrimônio ────────────────────────────

export type FotoPatrimonio = { data: string; patrimonio: number; investido: number };

// Patrimônio nominal ao longo do plano: o ponto de partida, o último valor de cada mês e hoje
export function serieNominal(
  fotos: FotoPatrimonio[], anoInicio: number, patrimonioInicial: number, hojeISO: string, patrimonioHoje: number,
): { t: number; v: number }[] {
  const ultimoDoMes = new Map<string, FotoPatrimonio>();
  for (const f of fotos) ultimoDoMes.set(f.data.slice(0, 7), f); // fotos em ordem: a última do mês vence
  const pts = [{ t: 0, v: patrimonioInicial }];
  for (const f of ultimoDoMes.values()) {
    const t = anosDesde(anoInicio, f.data);
    if (t > 0 && f.data < hojeISO) pts.push({ t, v: f.patrimonio });
  }
  const tHoje = anosDesde(anoInicio, hojeISO);
  if (tHoje > 0) pts.push({ t: tHoje, v: patrimonioHoje });
  return pts.sort((a, b) => a.t - b.t);
}

// Barras por ano: a última foto de cada ano já encerrado e o valor de hoje no ano corrente
export function barrasPorAno(
  fotos: FotoPatrimonio[], anoAtual: number, patrimonioHoje: number, investidoHoje: number,
): { ano: number; patrimonio: number; investido: number }[] {
  const porAno = new Map<number, FotoPatrimonio>();
  for (const f of fotos) {
    const ano = Number(f.data.slice(0, 4));
    if (ano < anoAtual) porAno.set(ano, f);
  }
  return [
    ...[...porAno.entries()].map(([ano, f]) => ({ ano, patrimonio: f.patrimonio, investido: f.investido })),
    { ano: anoAtual, patrimonio: patrimonioHoje, investido: investidoHoje },
  ];
}
