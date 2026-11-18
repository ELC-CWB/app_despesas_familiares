// Períodos do gráfico de preço do ativo (popup da Visão geral) e funções puras de apoio.

export type PeriodoId = "1m" | "3m" | "6m" | "1a" | "5a" | "max";

export const PERIODOS_GRAFICO: { id: PeriodoId; rotulo: string; range: string; intervalo: string }[] = [
  { id: "1m", rotulo: "1 mês", range: "1mo", intervalo: "1d" },
  { id: "3m", rotulo: "3 meses", range: "3mo", intervalo: "1d" },
  { id: "6m", rotulo: "6 meses", range: "6mo", intervalo: "1d" },
  { id: "1a", rotulo: "1 ano", range: "1y", intervalo: "1d" },
  { id: "5a", rotulo: "5 anos", range: "5y", intervalo: "1d" },
  { id: "max", rotulo: "Desde o início", range: "max", intervalo: "1wk" },
];

export const PERIODO_PADRAO: PeriodoId = "1a";

export type PontoGrafico = { data: string; fechamento: number };

// Variação percentual entre o primeiro e o último ponto da série
export function variacaoPercentual(pontos: PontoGrafico[]): number | null {
  if (pontos.length < 2) return null;
  const inicio = pontos[0].fechamento;
  const fim = pontos[pontos.length - 1].fechamento;
  if (!inicio) return null;
  return (fim / inicio - 1) * 100;
}
