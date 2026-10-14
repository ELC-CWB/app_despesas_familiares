// Hierarquia geografia > bloco > ativo com alvo, real, banda e desvio (SPEC §4.2, REGRAS §1).
// Funções puras; percentuais em pontos (3.5 = 3,5%).

import { COR_HEX, COR_TINTA } from "@/lib/carteira/constantes";
import { bandaEfetiva, foraDaBanda, tonsDosBlocos } from "@/lib/carteira/regras";
import type { Ativo, Bloco, Geografia } from "@/lib/carteira/tipos";

export type Nivel = 0 | 1 | 2; // 0 geografia, 1 bloco, 2 ativo

export type NoAlocacao = {
  id: string;
  nivel: Nivel;
  nome: string;
  rotulo: string;          // texto no gráfico: nome curto do bloco, código do ativo
  alvo: number;            // % da carteira (blocos e geografias: soma dos ativos)
  real: number;            // % atual
  valor: number;           // R$ atual
  banda: number | null;    // ± p.p.; geografias não têm banda
  fora: boolean;           // fora da banda (geografias nunca)
  desvio: number;          // real − alvo, em p.p.
  diferenca: number;       // desvio em R$ (positivo = sobra, negativo = falta)
  cor: string;             // pastel do gráfico
  tinta: string;           // tom escuro para textos
  pai: string | null;
  filhos: string[];
};

export type Alocacao = {
  nos: NoAlocacao[];       // em ordem de exibição: geografia, seus blocos, os ativos de cada bloco
  total: number;           // patrimônio (R$)
  semPosicoes: boolean;    // sem patrimônio não há o que comparar com os alvos
  fora: NoAlocacao[];      // blocos e ativos fora da banda
};

const porOrdem = <T extends { ordem: number }>(a: T, b: T) => a.ordem - b.ordem;

export function montarAlocacao(
  geografias: Geografia[],
  blocos: Bloco[],
  ativos: Ativo[],
  valores: Record<string, number>,
): Alocacao {
  const total = ativos.reduce((s, a) => s + (valores[a.id] ?? 0), 0);
  const semPosicoes = !(total > 0);
  const tons = tonsDosBlocos(geografias, blocos);
  const pct = (v: number) => (semPosicoes ? 0 : (v / total) * 100);

  const nos: NoAlocacao[] = [];
  for (const g of [...geografias].sort(porOrdem)) {
    // Blocos sem ativos ficam fora; geografias sem blocos visíveis também
    const doGeo = blocos
      .filter((b) => b.geografia_id === g.id && ativos.some((a) => a.bloco_id === b.id))
      .sort(porOrdem);
    if (!doGeo.length) continue;

    const noGeo: NoAlocacao = {
      id: g.id, nivel: 0, nome: g.nome, rotulo: g.nome, alvo: 0, real: 0, valor: 0, banda: null, fora: false,
      desvio: 0, diferenca: 0, cor: COR_HEX[g.cor] ?? COR_HEX.cinza, tinta: COR_TINTA[g.cor] ?? COR_TINTA.cinza,
      pai: null, filhos: doGeo.map((b) => b.id),
    };
    nos.push(noGeo);

    for (const b of doGeo) {
      const doBloco = ativos.filter((a) => a.bloco_id === b.id).sort(porOrdem);
      const noBloco: NoAlocacao = {
        id: b.id, nivel: 1, nome: b.nome, rotulo: b.nome_curto || b.nome, alvo: 0, real: 0, valor: 0, banda: null, fora: false,
        desvio: 0, diferenca: 0, cor: tons[b.id] ?? "#E3E8ED", tinta: noGeo.tinta, pai: g.id, filhos: doBloco.map((a) => a.id),
      };
      nos.push(noBloco);

      for (const a of doBloco) {
        const valor = valores[a.id] ?? 0;
        const real = pct(valor);
        const banda = bandaEfetiva(a.alvo_pct, a.banda_pp);
        const desvio = real - a.alvo_pct;
        nos.push({
          id: a.id, nivel: 2, nome: a.codigo, rotulo: a.codigo, alvo: a.alvo_pct, real, valor, banda,
          fora: !semPosicoes && foraDaBanda(real, a.alvo_pct, banda),
          desvio, diferenca: (desvio / 100) * total, cor: noBloco.cor, tinta: noGeo.tinta, pai: b.id, filhos: [],
        });
        noBloco.alvo += a.alvo_pct; noBloco.real += real; noBloco.valor += valor;
      }

      noBloco.banda = bandaEfetiva(noBloco.alvo, b.banda_pp);
      noBloco.desvio = noBloco.real - noBloco.alvo;
      noBloco.diferenca = (noBloco.desvio / 100) * total;
      noBloco.fora = !semPosicoes && foraDaBanda(noBloco.real, noBloco.alvo, noBloco.banda);
      noGeo.alvo += noBloco.alvo; noGeo.real += noBloco.real; noGeo.valor += noBloco.valor;
    }
    noGeo.desvio = noGeo.real - noGeo.alvo;
    noGeo.diferenca = (noGeo.desvio / 100) * total;
  }

  return { nos, total, semPosicoes, fora: nos.filter((n) => n.fora) };
}

// Texto da faixa de status (SPEC §4.2)
export function resumoStatus(a: Alocacao): { fora: boolean; titulo: string; detalhe: string } {
  if (a.semPosicoes) {
    return { fora: false, titulo: "Sem posições ainda", detalhe: "A comparação com a estratégia aparece depois das primeiras compras." };
  }
  if (!a.fora.length) {
    return { fora: false, titulo: "Sua carteira está dentro da estratégia", detalhe: "Todos os desvios estão dentro das bandas definidas." };
  }
  const blocos = a.fora.filter((n) => n.nivel === 1).map((n) => n.nome);
  const ativos = a.fora.filter((n) => n.nivel === 2).map((n) => n.nome);
  return {
    fora: true,
    titulo: "Sua carteira está fora da estratégia definida",
    detalhe: `Fora da banda: ${[...blocos, ...ativos].join(", ")}`,
  };
}
