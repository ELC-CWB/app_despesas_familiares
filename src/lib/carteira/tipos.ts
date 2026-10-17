import type { ChaveAliquota, CorPaleta, Mercado, MercadoCorretora, Moeda, TipoAtivo } from "@/lib/carteira/constantes";

// Espelho das tabelas carteira_* (supabase/migrations/20261013_carteira_base.sql).
// Percentuais em pontos (3.5 = 3,5%).

export type Corretora = {
  id: string;
  nome: string;
  mercado: MercadoCorretora;
  corr_br_pct: number;
  corr_br_min: number;
  corr_ext_pct: number;
  corr_ext_min_usd: number;
  emolumentos_pct: number;
  custodia_pct: number;
  spread_pct: number;
  iof_ida_pct: number;
  iof_volta_pct: number;
};

export type Geografia = { id: string; nome: string; cor: CorPaleta; ordem: number };

export type Bloco = {
  id: string;
  geografia_id: string;
  nome: string;
  nome_curto: string | null;
  banda_pp: number | null; // null = sugerida pela regra 5/25 sobre o alvo do bloco
  ordem: number;
};

export type Ativo = {
  id: string;
  codigo: string;
  ticker_cotacao: string | null;
  tipo: TipoAtivo;
  mercado: Mercado;
  moeda: Moeda;
  bloco_id: string;
  corretora_id: string | null;
  gestora: string | null;
  alvo_pct: number;
  banda_pp: number | null; // null = sugerida pela regra 5/25
  taxa_adm_pct: number;
  aliquota_ir_pct: number | null; // IR próprio do ativo; null = o padrão do tipo
  sede: string | null;            // sede do ativo (ex.: Brasil, Irlanda), só informativa
  ordem: number;
};

export type Aliquotas = Partial<Record<ChaveAliquota, number>>;

export type ConfigCarteira = {
  nome: string | null;   // nome da carteira (ex.: "Carteira teste"); null = o padrão
  fase: "acumulacao" | "usufruto";
  inicio_usufruto: string | null;
  colchao_ativo_id: string | null;
  colchao_min_meses: number;
  regra_protecao_on: boolean;
  regra_queda_pct: number;
  regra_corte_pct: number;
  regra_aumento_on: boolean;
  regra_gatilho_pct: number;
  regra_aumento_pct: number;
  aliquotas: Aliquotas;
  onboarding_concluido: boolean;
};

export type Plano = {
  id: string;
  versao: number;
  em_uso: boolean;
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

// O que Configurações edita e salva de uma vez
export type Estrutura = {
  corretoras: Corretora[];
  geografias: Geografia[];
  blocos: Bloco[];
  ativos: Ativo[];
  config: Pick<ConfigCarteira, "colchao_ativo_id" | "colchao_min_meses" | "aliquotas">;
};

export type PlanoEntrada = Omit<Plano, "id" | "versao" | "em_uso">;

// Posição informada no onboarding → compra inicial
export type PosicaoInicial = {
  ativo_id: string;
  quantidade: number;
  preco_medio: number; // na moeda do ativo
  custo_total_brl: number; // em R$ (igual a quantidade × preço médio para ativos em BRL)
};

export type OnboardingEntrada = {
  estrutura: Estrutura;
  plano: PlanoEntrada;
  posicoes: PosicaoInicial[];
};
