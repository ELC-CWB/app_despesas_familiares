// Geometria do gráfico de rosca em 3 anéis (geografia, bloco, ativo). Funções puras.
// Os ângulos seguem o ALVO (a estratégia); quando um item está fora da banda, o desvio aparece
// como uma fatia vermelha no fim do setor: sólida se sobra, hachurada se falta (SPEC §4.2).

import type { NoAlocacao } from "@/lib/carteira/alocacao";

export const CENTRO = 200;                       // viewBox 400 × 400
export const ANEIS: readonly (readonly [number, number])[] = [[34, 78], [84, 128], [134, 180]];
const FONTE = [14, 15, 13] as const;             // tamanho do texto por anel

// Arredondado em 2 casas: o servidor e o navegador calculam seno/cosseno com diferença na última
// casa, e coordenadas sem arredondar causam erro de hidratação no React.
const arredondar = (v: number) => Math.round(v * 100) / 100;

export function ponto(r: number, graus: number): [number, number] {
  const rad = ((graus - 90) * Math.PI) / 180;   // 0° no topo, sentido horário
  return [arredondar(CENTRO + r * Math.cos(rad)), arredondar(CENTRO + r * Math.sin(rad))];
}

const p = (r: number, graus: number) => ponto(r, graus).map((v) => v.toFixed(2)).join(" ");

// Setor de anel entre os raios r0 e r1 e os ângulos a0 e a1
export function arco(r0: number, r1: number, a0: number, a1: number): string {
  const fim = Math.min(a1, a0 + 359.99); // um arco de 360° exato some no SVG
  const grande = fim - a0 > 180 ? 1 : 0;
  return `M ${p(r1, a0)} A ${r1} ${r1} 0 ${grande} 1 ${p(r1, fim)} L ${p(r0, fim)} A ${r0} ${r0} 0 ${grande} 0 ${p(r0, a0)} Z`;
}

export type Letra = { ch: string; x: number; y: number; rot: number; fs: number };

export type Setor = {
  id: string;
  nivel: 0 | 1 | 2;
  a0: number;
  a1: number;
  d: string;
  px: number; py: number;                 // ponto médio (âncora do tooltip)
  desvio: string | null;                  // setor vermelho no fim da fatia
  tipoDesvio: "sobra" | "falta" | null;
  letras: Letra[];                        // rótulo curvo, uma letra por posição
};

// Rótulo ao longo do anel: cabe se o texto couber no arco (com folga de 4°) e na espessura
function rotulo(texto: string, nivel: 0 | 1 | 2, a0: number, a1: number): Letra[] {
  const [r0, r1] = ANEIS[nivel];
  const rm = (r0 + r1) / 2;
  const mid = (a0 + a1) / 2;
  const span = a1 - a0;
  for (const escala of [1, 0.85]) {
    const fs = FONTE[nivel] * escala;
    const passo = ((fs * 0.62) / rm) * (180 / Math.PI);
    const total = passo * texto.length;
    if (total <= span - 4 && fs * 1.2 <= r1 - r0 - 4) {
      return [...texto].map((ch, i) => {
        const graus = mid - total / 2 + (i + 0.5) * passo;
        const [x, y] = ponto(rm, graus);
        return { ch, x, y, rot: Math.round(graus * 10) / 10, fs };
      });
    }
  }
  return [];
}

export function calcularSetores(nos: NoAlocacao[]): Setor[] {
  const porId = new Map(nos.map((n) => [n.id, n]));
  const totalAlvos = nos.filter((n) => n.nivel === 0).reduce((s, n) => s + n.alvo, 0);
  if (!(totalAlvos > 0)) return [];

  const setores: Setor[] = [];
  const colocar = (no: NoAlocacao, inicio: number) => {
    const span = (no.alvo / totalAlvos) * 360;
    if (!(span > 0)) return;
    const a0 = inicio, a1 = inicio + span;
    const [r0, r1] = ANEIS[no.nivel];
    const [px, py] = ponto((r0 + r1) / 2, (a0 + a1) / 2);

    let desvio: string | null = null;
    let tipoDesvio: Setor["tipoDesvio"] = null;
    if (no.fora && no.alvo > 0) {
      const fracao = Math.min(Math.abs(no.desvio) / no.alvo, 1);
      desvio = arco(r0, r1, a1 - span * fracao, a1);
      tipoDesvio = no.desvio > 0 ? "sobra" : "falta";
    }
    setores.push({ id: no.id, nivel: no.nivel, a0, a1, d: arco(r0, r1, a0, a1), px, py, desvio, tipoDesvio, letras: rotulo(no.rotulo, no.nivel, a0, a1) });

    let cursor = inicio;
    for (const f of no.filhos) {
      const filho = porId.get(f);
      if (!filho) continue;
      colocar(filho, cursor);
      cursor += (filho.alvo / totalAlvos) * 360;
    }
  };

  let cursor = 0;
  for (const g of nos.filter((n) => n.nivel === 0)) {
    colocar(g, cursor);
    cursor += (g.alvo / totalAlvos) * 360;
  }
  return setores;
}
