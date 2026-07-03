const B3_SECTORS: { symbol: string; sector: string }[] = [
  // Bancos
  { symbol: "ITUB3", sector: "Bancos" },
  { symbol: "BBDC4", sector: "Bancos" },
  { symbol: "BBDC3", sector: "Bancos" },
  { symbol: "SANB11", sector: "Bancos" },
  { symbol: "SANB4", sector: "Bancos" },
  { symbol: "SANB3", sector: "Bancos" },
  { symbol: "BBAS3", sector: "Bancos" },
  { symbol: "BPAC11", sector: "Bancos" },
  { symbol: "BPAC3", sector: "Bancos" },
  { symbol: "BRSR6", sector: "Bancos" },
  { symbol: "BRSR3", sector: "Bancos" },
  { symbol: "ABCB4", sector: "Bancos" },
  { symbol: "BMGB4", sector: "Bancos" },
  { symbol: "ITSA4", sector: "Bancos" },
  { symbol: "ITSA3", sector: "Bancos" },
  { symbol: "BPAN4", sector: "Bancos" },
  // Energia Elétrica
  { symbol: "EGIE3", sector: "Energia Elétrica" },
  { symbol: "CPFE3", sector: "Energia Elétrica" },
  { symbol: "TRPL4", sector: "Energia Elétrica" },
  { symbol: "TRPL3", sector: "Energia Elétrica" },
  { symbol: "ENGI11", sector: "Energia Elétrica" },
  { symbol: "ENGI3", sector: "Energia Elétrica" },
  { symbol: "TAEE11", sector: "Energia Elétrica" },
  { symbol: "TAEE4", sector: "Energia Elétrica" },
  { symbol: "TAEE3", sector: "Energia Elétrica" },
  { symbol: "CMIG4", sector: "Energia Elétrica" },
  { symbol: "CMIG3", sector: "Energia Elétrica" },
  { symbol: "CPLE6", sector: "Energia Elétrica" },
  { symbol: "CPLE3", sector: "Energia Elétrica" },
  { symbol: "ENBR3", sector: "Energia Elétrica" },
  { symbol: "AURE3", sector: "Energia Elétrica" },
  { symbol: "EQTL3", sector: "Energia Elétrica" },
  { symbol: "NEOE3", sector: "Energia Elétrica" },
  { symbol: "CESP6", sector: "Energia Elétrica" },
  { symbol: "ALUP11", sector: "Energia Elétrica" },
  { symbol: "ALUP4", sector: "Energia Elétrica" },
  { symbol: "ALUP3", sector: "Energia Elétrica" },
  // Saneamento
  { symbol: "SAPR4", sector: "Saneamento" },
  { symbol: "SAPR3", sector: "Saneamento" },
  { symbol: "SAPR11", sector: "Saneamento" },
  { symbol: "CSMG3", sector: "Saneamento" },
  { symbol: "SBSP3", sector: "Saneamento" },
  // Petróleo & Gás
  { symbol: "PETR4", sector: "Petróleo & Gás" },
  { symbol: "PETR3", sector: "Petróleo & Gás" },
  { symbol: "PRIO3", sector: "Petróleo & Gás" },
  { symbol: "RRRP3", sector: "Petróleo & Gás" },
  { symbol: "RECV3", sector: "Petróleo & Gás" },
  { symbol: "VBBR3", sector: "Petróleo & Gás" },
  { symbol: "CGAS5", sector: "Petróleo & Gás" },
  // Mineração & Siderurgia
  { symbol: "VALE3", sector: "Mineração & Siderurgia" },
  { symbol: "CMIN3", sector: "Mineração & Siderurgia" },
  { symbol: "CSNA3", sector: "Mineração & Siderurgia" },
  { symbol: "GGBR4", sector: "Mineração & Siderurgia" },
  { symbol: "GGBR3", sector: "Mineração & Siderurgia" },
  { symbol: "GOAU4", sector: "Mineração & Siderurgia" },
  { symbol: "GOAU3", sector: "Mineração & Siderurgia" },
  { symbol: "FESA4", sector: "Mineração & Siderurgia" },
  { symbol: "FESA3", sector: "Mineração & Siderurgia" },
  { symbol: "BRAP4", sector: "Mineração & Siderurgia" },
  { symbol: "BRAP3", sector: "Mineração & Siderurgia" },
  { symbol: "USIM5", sector: "Mineração & Siderurgia" },
  { symbol: "KLBN11", sector: "Mineração & Siderurgia" },
  { symbol: "KLBN4", sector: "Mineração & Siderurgia" },
  { symbol: "SUZB3", sector: "Mineração & Siderurgia" },
  // Telecom
  { symbol: "VIVT3", sector: "Telecom" },
  { symbol: "TIMS3", sector: "Telecom" },
  // Seguros
  { symbol: "BBSE3", sector: "Seguros" },
  { symbol: "CXSE3", sector: "Seguros" },
  { symbol: "PSSA3", sector: "Seguros" },
  // Consumo & Alimentos
  { symbol: "AMBEV3", sector: "Consumo" },
  { symbol: "MDIA3", sector: "Consumo" },
  { symbol: "GRND3", sector: "Consumo" },
  { symbol: "VULC3", sector: "Consumo" },
  { symbol: "RANI3", sector: "Consumo" },
  // Saúde
  { symbol: "FLRY3", sector: "Saúde" },
  { symbol: "HAPV3", sector: "Saúde" },
  { symbol: "DASA3", sector: "Saúde" },
  { symbol: "RDOR3", sector: "Saúde" },
  // Logística & Transporte
  { symbol: "RAIL3", sector: "Logística" },
  { symbol: "POMO4", sector: "Logística" },
  { symbol: "POMO3", sector: "Logística" },
  { symbol: "TPIS3", sector: "Logística" },
  // Indústria
  { symbol: "WEGE3", sector: "Indústria" },
  { symbol: "TUPY3", sector: "Indústria" },
  { symbol: "UNIP6", sector: "Indústria" },
  { symbol: "FRAS3", sector: "Indústria" },
  // Varejo & Outros
  { symbol: "ALPA4", sector: "Varejo" },
  { symbol: "TOTS3", sector: "Varejo" },
  { symbol: "EVEN3", sector: "Varejo" },
  { symbol: "CYRE3", sector: "Varejo" },
  // Agronegócio
  { symbol: "BEEF3", sector: "Agronegócio" },
  { symbol: "SLCE3", sector: "Agronegócio" },
  { symbol: "AGRO3", sector: "Agronegócio" },
];

export const SECTOR_MAP: Record<string, string> = Object.fromEntries(
  B3_SECTORS.map(({ symbol, sector }) => [symbol, sector])
);

export function getSector(symbol: string, brapiSector?: string | null): string {
  return SECTOR_MAP[symbol] ?? brapiSector ?? "Outros";
}
