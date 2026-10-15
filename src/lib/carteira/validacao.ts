// Validação da estrutura e do onboarding — usada na tela (antes de salvar) e na API.
// Devolve a primeira mensagem de erro, no texto do protótipo, ou null.

import { ALIQUOTAS_PADRAO, COR_IDS, MOEDAS, TIPO_IDS, type ChaveAliquota } from "@/lib/carteira/constantes";
import { ANOS_PERPETUO, type Revisao } from "@/lib/carteira/plano";
import { alvosFecham100, somaAlvos } from "@/lib/carteira/regras";
import type { Estrutura, OnboardingEntrada, PlanoEntrada } from "@/lib/carteira/tipos";

const fmt1 = (v: number) => v.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 2 });
const naoNegativo = (v: unknown) => typeof v === "number" && Number.isFinite(v) && v >= 0;
const vazio = (s: string | null | undefined) => !s || !s.trim();

// Configurações aceita estrutura parcial (listas vazias, soma ≠ 100%): o usuário monta aos poucos.
// Só a integridade é exigida aqui; a estratégia completa é cobrada em validarOnboarding.
export function validarEstrutura(e: Estrutura): string | null {
  if (e.geografias.some((g) => vazio(g.nome))) return "Dê um nome a todas as geografias.";
  if (e.geografias.some((g) => !COR_IDS.includes(g.cor))) return "Escolha a cor de todas as geografias.";

  if (e.blocos.some((b) => vazio(b.nome))) return "Dê um nome a todos os blocos.";
  const geoIds = new Set(e.geografias.map((g) => g.id));
  if (e.blocos.some((b) => !geoIds.has(b.geografia_id))) return "Escolha a geografia de todos os blocos.";
  if (e.blocos.some((b) => b.banda_pp != null && !naoNegativo(b.banda_pp))) return "A banda dos blocos não pode ser negativa.";

  if (e.corretoras.some((c) => vazio(c.nome))) return "Informe o nome de todas as corretoras.";
  const numerosCorretora = ["corr_br_pct", "corr_br_min", "corr_ext_pct", "corr_ext_min_usd", "emolumentos_pct",
    "custodia_pct", "spread_pct", "iof_ida_pct", "iof_volta_pct"] as const;
  if (e.corretoras.some((c) => numerosCorretora.some((k) => !naoNegativo(c[k])))) {
    return "Os custos das corretoras precisam ser números maiores ou iguais a zero.";
  }

  if (e.ativos.some((a) => vazio(a.codigo))) return "Informe o código de todos os ativos.";
  const codigos = e.ativos.map((a) => a.codigo.trim().toUpperCase());
  const repetido = codigos.find((c, i) => codigos.indexOf(c) !== i);
  if (repetido) return `O código ${repetido} aparece mais de uma vez.`;
  if (e.ativos.some((a) => !TIPO_IDS.includes(a.tipo))) return "Escolha o tipo de todos os ativos.";
  if (e.ativos.some((a) => !MOEDAS.includes(a.moeda))) return "Escolha a moeda de todos os ativos.";
  const blocoIds = new Set(e.blocos.map((b) => b.id));
  if (e.ativos.some((a) => !blocoIds.has(a.bloco_id))) return "Escolha o bloco de todos os ativos.";
  const corretoraIds = new Set(e.corretoras.map((c) => c.id));
  if (e.ativos.some((a) => a.corretora_id != null && !corretoraIds.has(a.corretora_id))) {
    return "Escolha a corretora de todos os ativos.";
  }
  if (e.ativos.some((a) => !naoNegativo(a.alvo_pct) || a.alvo_pct > 100)) return "Os alvos precisam estar entre 0% e 100%.";
  if (e.ativos.some((a) => a.banda_pp != null && !naoNegativo(a.banda_pp))) return "A banda dos ativos não pode ser negativa.";
  if (e.ativos.some((a) => !naoNegativo(a.taxa_adm_pct))) return "A taxa de administração não pode ser negativa.";
  if (e.ativos.some((a) => (a.sede ?? "").length > 60)) return "A sede do ativo pode ter no máximo 60 caracteres.";
  if (e.ativos.some((a) => a.aliquota_ir_pct != null && !(a.aliquota_ir_pct >= 0 && a.aliquota_ir_pct <= 100))) return "A alíquota de IR do ativo precisa estar entre 0% e 100%.";

  const { colchao_ativo_id, colchao_min_meses, aliquotas } = e.config;
  if (colchao_ativo_id != null && !e.ativos.some((a) => a.id === colchao_ativo_id)) {
    return "O ativo escolhido como colchão não está na lista de ativos.";
  }
  if (!Number.isInteger(colchao_min_meses) || colchao_min_meses < 0) return "A cobertura mínima do colchão precisa ser um número inteiro de meses.";
  for (const [k, v] of Object.entries(aliquotas)) {
    if (!(k in ALIQUOTAS_PADRAO)) return "Alíquota de imposto desconhecida.";
    if (!naoNegativo(v) || (v as number) > 100) return `A alíquota de ${k as ChaveAliquota} precisa estar entre 0% e 100%.`;
  }
  return null;
}

export function validarPlano(p: PlanoEntrada): string | null {
  const campos = [p.patrimonio_inicial, p.aporte_mensal, p.anos_aporte, p.retirada_pct, p.rent_pess_pct, p.rent_otim_pct];
  if (campos.some((v) => !Number.isFinite(v))) return "Preencha todos os campos do plano.";
  if (p.patrimonio_inicial < 0 || p.aporte_mensal < 0) return "Patrimônio inicial e aporte não podem ser negativos.";
  if (!Number.isInteger(p.anos_aporte) || p.anos_aporte < 0) return "Os anos de aporte precisam ser um número inteiro.";
  if (!p.perpetuo && (p.anos_usufruto == null || !Number.isInteger(p.anos_usufruto) || p.anos_usufruto < 1)) {
    return "Informe os anos de usufruto.";
  }
  if (p.retirada_pct <= 0) return "A retirada anual precisa ser maior que zero.";
  if (p.rent_pess_pct >= p.rent_otim_pct) return "A rentabilidade pessimista precisa ser menor que a otimista.";
  return validarRevisoes(p);
}

// Revisões (a partir de um ano): ano dentro do plano e sem repetição; valores válidos; pessimista < otimista em
// vigor; o último ano de aporte revisto não pode ser anterior ao ano da revisão menos um
export function validarRevisoes(p: PlanoEntrada & { revisoes?: Revisao[] }): string | null {
  const ordenadas = [...(p.revisoes ?? [])].sort((a, b) => a.ano - b.ano);
  const usufruto = p.perpetuo ? ANOS_PERPETUO : p.anos_usufruto ?? 0;
  const anos = new Set<number>();
  let aporte = p.anos_aporte;
  let pess = p.rent_pess_pct, otim = p.rent_otim_pct;
  for (const r of ordenadas) {
    const fim = p.ano_inicio + aporte + usufruto;
    if (!Number.isInteger(r.ano) || r.ano <= p.ano_inicio || r.ano > fim) {
      return `O ano de cada revisão precisa estar entre ${p.ano_inicio + 1} e ${fim}.`;
    }
    if (anos.has(r.ano)) return `Há duas revisões para ${r.ano}. Junte os ajustes em uma só.`;
    anos.add(r.ano);
    const valores = [r.aporte_mensal, r.rent_pess_pct, r.rent_otim_pct, r.retirada_pct, r.fim_aporte];
    if (valores.every((v) => v == null)) return `A revisão de ${r.ano} não altera nada: preencha pelo menos um campo.`;
    if (valores.some((v) => v != null && !Number.isFinite(v))) return `Preencha corretamente a revisão de ${r.ano}.`;
    if (r.aporte_mensal != null && r.aporte_mensal < 0) return `O aporte da revisão de ${r.ano} não pode ser negativo.`;
    if (r.retirada_pct != null && r.retirada_pct <= 0) return `A retirada da revisão de ${r.ano} precisa ser maior que zero.`;
    if (r.fim_aporte != null) {
      if (!Number.isInteger(r.fim_aporte)) return `O último ano de aporte da revisão de ${r.ano} precisa ser um número inteiro.`;
      if (r.fim_aporte < r.ano - 1) return `Na revisão de ${r.ano}, o último ano de aporte não pode ser anterior a ${r.ano - 1}.`;
      aporte = r.fim_aporte - p.ano_inicio + 1;
    }
    pess = r.rent_pess_pct ?? pess;
    otim = r.rent_otim_pct ?? otim;
    if (pess >= otim) return `Na revisão de ${r.ano}, a rentabilidade pessimista precisa ser menor que a otimista.`;
  }
  // se uma revisão encurtou o plano, nenhuma revisão pode ficar depois do fim
  const fimFinal = p.ano_inicio + aporte + usufruto;
  const fora = ordenadas.find((r) => r.ano > fimFinal);
  if (fora) return `A revisão de ${fora.ano} ficou depois do fim do plano (${fimFinal}).`;
  return null;
}

// Primeiros passos: estratégia completa (tudo cadastrado e alvos fechando 100%)
export function validarOnboarding(o: OnboardingEntrada): string | null {
  const e = o.estrutura;
  if (!e.geografias.length) return "Cadastre pelo menos uma geografia.";
  if (!e.blocos.length) return "Cadastre pelo menos um bloco.";
  if (!e.corretoras.length) return "Cadastre pelo menos uma corretora.";
  if (!e.ativos.length) return "Cadastre pelo menos um ativo.";
  const erro = validarEstrutura(e);
  if (erro) return erro;
  const soma = somaAlvos(e.ativos);
  if (!alvosFecham100(soma)) return `A soma dos alvos precisa ser 100% (hoje está em ${fmt1(soma)}%).`;
  const vazios = e.blocos.filter((b) => !e.ativos.some((a) => a.bloco_id === b.id));
  if (vazios.length) {
    return `O bloco ${vazios.map((b) => b.nome).join(", ")} não tem ativos. Adicione ativos a ele ou volte e remova o bloco.`;
  }
  const erroPlano = validarPlano(o.plano);
  if (erroPlano) return erroPlano;
  const ativoIds = new Set(o.estrutura.ativos.map((a) => a.id));
  for (const p of o.posicoes) {
    if (!ativoIds.has(p.ativo_id)) return "Posição informada para um ativo que não existe.";
    if (!(p.quantidade > 0) || !(p.preco_medio > 0) || !(p.custo_total_brl > 0)) {
      return "Nas posições, quantidade, preço médio e custo precisam ser maiores que zero.";
    }
  }
  return null;
}
