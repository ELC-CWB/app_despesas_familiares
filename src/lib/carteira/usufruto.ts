// Usufruto (docs/carteira/REGRAS.md §3 e §4): saque do mês, ativo a vender, cobertura do colchão e guardrails.
// Funções puras: a tela e a API só carregam os dados e chamam estas funções.

import type { IpcaMes } from "./plano";

export type MotivoRetirada = "inicial" | "protecao" | "retorno_pico" | "aumento";
export type Decisao = "aceito" | "recusado";

export type Retirada = {
  id: string;
  vigente_desde: string;         // AAAA-MM-DD
  valor_mensal: number;          // em reais correntes na data de vigência
  valor_anterior: number | null; // só na proteção: valor mensal antes da redução
  motivo: MotivoRetirada;
  decisao: Decisao | null;       // null = não é sugestão (ex.: inicial)
};

export type RegrasGuardrails = {
  protecao_on: boolean; queda_pct: number; corte_pct: number;
  aumento_on: boolean; gatilho_pct: number; aumento_pct: number;
};

// ── Inflação ───────────────────────────────────────────────────────────────────

const somaAnos = (iso: string, n: number) => `${Number(iso.slice(0, 4)) + n}${iso.slice(4)}`;

// IPCA acumulado nos 12 meses encerrados antes de `aniversarioISO` (meses inteiros)
export function ipca12Meses(ipca: IpcaMes[], aniversarioISO: string): number {
  const fim = `${aniversarioISO.slice(0, 7)}-01`;
  const ini = `${somaAnos(fim, -1)}`;
  return ipca
    .filter((m) => m.competencia >= ini && m.competencia < fim)
    .reduce((f, m) => f * (1 + m.variacao_pct / 100), 1);
}

// Correção anual (REGRAS §3): a cada aniversário do início do usufruto, o valor sobe pelo IPCA dos
// 12 meses anteriores. Só conta aniversários depois de `desde` e até hoje; sem inflação futura.
export function corrigirPorAniversarios(valor: number, desde: string, inicio: string, hoje: string, ipca: IpcaMes[]): number {
  let v = valor;
  for (let k = 1; k <= 80; k++) {
    const aniv = somaAnos(inicio, k);
    if (aniv > hoje) break;
    if (aniv > desde) v *= ipca12Meses(ipca, aniv);
  }
  return v;
}

// ── Saque vigente ──────────────────────────────────────────────────────────────

const efetiva = (r: Retirada) => r.decisao !== "recusado";

// Última retirada em vigor (as recusadas não mudam nada), em ordem cronológica
export function retiradaVigente(retiradas: Retirada[]): Retirada | null {
  const ord = [...retiradas].filter(efetiva).sort((a, b) => a.vigente_desde.localeCompare(b.vigente_desde));
  return ord.at(-1) ?? null;
}

export function saqueMensalAtual(retiradas: Retirada[], inicio: string, hoje: string, ipca: IpcaMes[]): number {
  const r = retiradaVigente(retiradas);
  return r ? corrigirPorAniversarios(r.valor_mensal, r.vigente_desde, inicio, hoje, ipca) : 0;
}

// Saque inicial: patrimônio no início do usufruto × retirada% ao ano ÷ 12
export const saqueInicial = (patrimonio: number, retiradaPct: number) => (patrimonio * retiradaPct) / 1200;

// ── Qual ativo vender (REGRAS §3) ──────────────────────────────────────────────

export type AtivoSaque = { id: string; codigo: string; mercado: "brasil" | "exterior"; alvo_pct: number; banda_pp: number | null };

export type EscolhaSaque = {
  ativo: AtivoSaque | null;
  motivo: "brasil" | "exterior" | "colchao" | "mais_perto" | "sem_ativo";
  excesso: number;           // R$ acima do alvo do ativo escolhido (0 no colchão e no "mais perto")
  fica_abaixo: boolean;      // o saque é maior que o excesso: o ativo ficará abaixo do alvo
};

export function escolherAtivoSaque(
  ativos: AtivoSaque[], valores: Record<string, number>, saque: number, colchaoId: string | null,
): EscolhaSaque {
  const total = ativos.reduce((s, a) => s + (valores[a.id] ?? 0), 0);
  const vazio: EscolhaSaque = { ativo: null, motivo: "sem_ativo", excesso: 0, fica_abaixo: false };
  if (total <= 0) return vazio;
  // excesso(a) = (real% − alvo%) × patrimônio
  const excesso = (a: AtivoSaque) => ((valores[a.id] ?? 0) / total - a.alvo_pct / 100) * total;
  const comSaldo = ativos.filter((a) => (valores[a.id] ?? 0) > 0);
  const acima = (m: "brasil" | "exterior") =>
    comSaldo.filter((a) => a.mercado === m && a.id !== colchaoId && excesso(a) > 0.005).sort((x, y) => excesso(y) - excesso(x))[0];

  const br = acima("brasil");
  if (br) return { ativo: br, motivo: "brasil", excesso: excesso(br), fica_abaixo: saque > excesso(br) };
  const ext = acima("exterior");
  if (ext) return { ativo: ext, motivo: "exterior", excesso: excesso(ext), fica_abaixo: saque > excesso(ext) };

  const colchao = colchaoId ? comSaldo.find((a) => a.id === colchaoId) : undefined;
  if (colchao) return { ativo: colchao, motivo: "colchao", excesso: 0, fica_abaixo: false };

  const perto = [...comSaldo].sort((x, y) => Math.abs(excesso(x)) - Math.abs(excesso(y)))[0];
  return perto ? { ativo: perto, motivo: "mais_perto", excesso: 0, fica_abaixo: true } : vazio;
}

// Meses de saque que o colchão cobre: floor(valor do colchão / saque mensal)
export function coberturaColchao(valorColchao: number, saqueMensal: number): number | null {
  if (saqueMensal <= 0) return null;
  return Math.floor(valorColchao / saqueMensal + 1e-9);
}

// ── Pico e guardrails (REGRAS §4) ──────────────────────────────────────────────

export type PontoPatrimonio = { data: string; patrimonio: number };

// Pico desde o início do usufruto, em reais de hoje: cada ponto é corrigido pelo IPCA acumulado até hoje
export function picoCorrigido(
  pontos: PontoPatrimonio[], inicio: string, hoje: string, patrimonioHoje: number, ipca: IpcaMes[],
): number {
  const fatorAte = (data: string) => {
    const de = `${data.slice(0, 7)}-01`;
    const ate = `${hoje.slice(0, 7)}-01`;
    return ipca.filter((m) => m.competencia >= de && m.competencia < ate).reduce((f, m) => f * (1 + m.variacao_pct / 100), 1);
  };
  const corrigidos = pontos.filter((p) => p.data >= inicio && p.data <= hoje).map((p) => p.patrimonio * fatorAte(p.data));
  return Math.max(patrimonioHoje, ...corrigidos);
}

export type AlertaRetirada =
  | { tipo: "protecao"; queda_pct: number; novo_valor: number; valor_anterior: number }
  | { tipo: "retorno_pico"; novo_valor: number }
  | { tipo: "aumento"; retirada_pct: number; novo_valor: number };

export type EntradaGuardrails = {
  regras: RegrasGuardrails;
  hoje: string;
  inicio: string;
  retiradas: Retirada[];
  ipca: IpcaMes[];
  patrimonio: number;
  pico: number;                  // já em reais de hoje
  pontos: PontoPatrimonio[];     // fotos diárias, para saber se a situação mudou depois de uma recusa
};

const queda = (patrimonio: number, pico: number) => (pico > 0 ? (1 - patrimonio / pico) * 100 : 0);

// Último aniversário do início do usufruto que já passou (a revisão anual do aumento)
export function ultimaRevisao(inicio: string, hoje: string): string | null {
  let r: string | null = null;
  for (let k = 1; k <= 80; k++) {
    const a = somaAnos(inicio, k);
    if (a > hoje) break;
    r = a;
  }
  return r;
}

// A proteção é avaliada primeiro; o aumento só entra se ela não disparou nem está em curso.
export function avaliarGuardrails(e: EntradaGuardrails): AlertaRetirada | null {
  const { regras, hoje, inicio, retiradas, ipca, patrimonio, pico } = e;
  const ord = [...retiradas].sort((a, b) => a.vigente_desde.localeCompare(b.vigente_desde) || a.id.localeCompare(b.id));
  const vigente = retiradaVigente(ord);
  if (!vigente) return null;
  const atual = corrigirPorAniversarios(vigente.valor_mensal, vigente.vigente_desde, inicio, hoje, ipca);
  const emProtecao = vigente.motivo === "protecao";
  const q = queda(patrimonio, pico);

  // Proteção em curso: volta ao valor anterior quando a carteira recupera o pico
  if (emProtecao) {
    const recuperou = patrimonio >= pico - 0.005;
    const recusouRetorno = ord.some((r) => r.motivo === "retorno_pico" && r.decisao === "recusado" && r.vigente_desde >= vigente.vigente_desde);
    if (recuperou && !recusouRetorno && vigente.valor_anterior != null && vigente.valor_mensal > 0) {
      return { tipo: "retorno_pico", novo_valor: atual * (vigente.valor_anterior / vigente.valor_mensal) };
    }
    return null;
  }

  if (regras.protecao_on && q > regras.queda_pct) {
    // Recusada: só volta se a carteira recuperou (saiu da queda) depois da recusa e caiu de novo
    const recusa = [...ord].reverse().find((r) => r.motivo === "protecao" && r.decisao === "recusado");
    const recuperouDepois = !recusa || e.pontos.some((p) => p.data > recusa.vigente_desde && queda(p.patrimonio, pico) <= regras.queda_pct);
    if (recuperouDepois) {
      return { tipo: "protecao", queda_pct: q, novo_valor: atual * (1 - regras.corte_pct / 100), valor_anterior: atual };
    }
    return null;
  }

  // Aumento: revisão anual. Recusado volta na revisão do ano seguinte.
  if (regras.aumento_on && patrimonio > 0) {
    const revisao = ultimaRevisao(inicio, hoje);
    if (!revisao) return null;
    const jaDecidiu = ord.some((r) => r.motivo === "aumento" && r.decisao != null && r.vigente_desde >= revisao);
    const retiradaPct = ((atual * 12) / patrimonio) * 100;
    if (!jaDecidiu && retiradaPct < regras.gatilho_pct) {
      return { tipo: "aumento", retirada_pct: retiradaPct, novo_valor: atual * (1 + regras.aumento_pct / 100) };
    }
  }
  return null;
}

// ── Estado do usufruto (o que a Visão geral mostra) ────────────────────────────

export type EstadoUsufruto = {
  inicio: string;
  saque: number;                       // saque mensal bruto de hoje, já corrigido pelo IPCA
  escolha: {
    ativo_id: string; codigo: string; motivo: EscolhaSaque["motivo"]; excesso: number; fica_abaixo: boolean;
    mercado: "brasil" | "exterior"; valor_posicao: number;
  } | null;
  colchao: { codigo: string; valor: number; meses: number | null; minimo: number; abaixo: boolean } | null;
  alerta: AlertaRetirada | null;
  pico: number;
  queda_pct: number;
};

export function montarEstadoUsufruto(e: {
  inicio: string; hoje: string;
  ativos: (AtivoSaque & { codigo: string })[];
  valores: Record<string, number>; total: number;
  colchaoId: string | null; colchaoMinMeses: number;
  regras: RegrasGuardrails;
  retiradas: Retirada[]; ipca: IpcaMes[]; pontos: PontoPatrimonio[];
}): EstadoUsufruto {
  const saque = saqueMensalAtual(e.retiradas, e.inicio, e.hoje, e.ipca);
  const esc = escolherAtivoSaque(e.ativos, e.valores, saque, e.colchaoId);
  const colchaoAtivo = e.colchaoId ? e.ativos.find((a) => a.id === e.colchaoId) : undefined;
  const valorColchao = colchaoAtivo ? e.valores[colchaoAtivo.id] ?? 0 : 0;
  const meses = colchaoAtivo ? coberturaColchao(valorColchao, saque) : null;
  const pico = picoCorrigido(e.pontos, e.inicio, e.hoje, e.total, e.ipca);
  return {
    inicio: e.inicio,
    saque,
    escolha: esc.ativo ? {
      ativo_id: esc.ativo.id, codigo: esc.ativo.codigo, motivo: esc.motivo, excesso: esc.excesso, fica_abaixo: esc.fica_abaixo,
      mercado: esc.ativo.mercado, valor_posicao: e.valores[esc.ativo.id] ?? 0,
    } : null,
    colchao: colchaoAtivo ? {
      codigo: colchaoAtivo.codigo, valor: valorColchao, meses, minimo: e.colchaoMinMeses,
      abaixo: meses != null && meses < e.colchaoMinMeses,
    } : null,
    alerta: avaliarGuardrails({
      regras: e.regras, hoje: e.hoje, inicio: e.inicio, retiradas: e.retiradas, ipca: e.ipca,
      patrimonio: e.total, pico, pontos: e.pontos,
    }),
    pico,
    queda_pct: queda(e.total, pico),
  };
}
