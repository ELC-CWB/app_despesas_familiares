// One ticker per company — prefer unit (11) > PN (4/5/6) > ON (3)
const B3_SECTORS: { symbol: string; sector: string }[] = [
  // Bancos
  { symbol: "ITUB4",  sector: "Bancos" },
  { symbol: "BBDC4",  sector: "Bancos" },
  { symbol: "SANB11", sector: "Bancos" },
  { symbol: "BBAS3",  sector: "Bancos" },
  { symbol: "BPAC11", sector: "Bancos" },
  { symbol: "BRSR6",  sector: "Bancos" },
  { symbol: "ABCB4",  sector: "Bancos" },
  { symbol: "BMGB4",  sector: "Bancos" },
  { symbol: "ITSA4",  sector: "Bancos" },
  { symbol: "BPAN4",  sector: "Bancos" },
  { symbol: "PINE4",  sector: "Bancos" },
  { symbol: "BGIP4",  sector: "Bancos" },
  // Energia Elétrica
  { symbol: "EGIE3",  sector: "Energia Elétrica" },
  { symbol: "CPFE3",  sector: "Energia Elétrica" },
  { symbol: "TRPL4",  sector: "Energia Elétrica" },
  { symbol: "ENGI11", sector: "Energia Elétrica" },
  { symbol: "TAEE11", sector: "Energia Elétrica" },
  { symbol: "CMIG4",  sector: "Energia Elétrica" },
  { symbol: "CPLE6",  sector: "Energia Elétrica" },
  { symbol: "ENBR3",  sector: "Energia Elétrica" },
  { symbol: "AURE3",  sector: "Energia Elétrica" },
  { symbol: "EQTL3",  sector: "Energia Elétrica" },
  { symbol: "NEOE3",  sector: "Energia Elétrica" },
  { symbol: "CESP6",  sector: "Energia Elétrica" },
  { symbol: "ALUP11", sector: "Energia Elétrica" },
  { symbol: "ENEV3",  sector: "Energia Elétrica" },
  { symbol: "ELET3",  sector: "Energia Elétrica" },
  { symbol: "EMAE4",  sector: "Energia Elétrica" },
  { symbol: "AESB3",  sector: "Energia Elétrica" },
  // Saneamento
  { symbol: "SAPR11", sector: "Saneamento" },
  { symbol: "CSMG3",  sector: "Saneamento" },
  { symbol: "SBSP3",  sector: "Saneamento" },
  // Petróleo & Gás
  { symbol: "PETR4",  sector: "Petróleo & Gás" },
  { symbol: "PRIO3",  sector: "Petróleo & Gás" },
  { symbol: "RRRP3",  sector: "Petróleo & Gás" },
  { symbol: "RECV3",  sector: "Petróleo & Gás" },
  { symbol: "VBBR3",  sector: "Petróleo & Gás" },
  { symbol: "CGAS5",  sector: "Petróleo & Gás" },
  // Mineração & Siderurgia
  { symbol: "VALE3",  sector: "Mineração & Siderurgia" },
  { symbol: "CMIN3",  sector: "Mineração & Siderurgia" },
  { symbol: "CSNA3",  sector: "Mineração & Siderurgia" },
  { symbol: "GGBR4",  sector: "Mineração & Siderurgia" },
  { symbol: "GOAU4",  sector: "Mineração & Siderurgia" },
  { symbol: "FESA4",  sector: "Mineração & Siderurgia" },
  { symbol: "BRAP4",  sector: "Mineração & Siderurgia" },
  { symbol: "USIM5",  sector: "Mineração & Siderurgia" },
  { symbol: "KLBN11", sector: "Mineração & Siderurgia" },
  { symbol: "SUZB3",  sector: "Mineração & Siderurgia" },
  { symbol: "DXCO3",  sector: "Mineração & Siderurgia" },
  // Telecom
  { symbol: "VIVT3",  sector: "Telecom" },
  { symbol: "TIMS3",  sector: "Telecom" },
  { symbol: "TELB4",  sector: "Telecom" },
  // Seguros
  { symbol: "BBSE3",  sector: "Seguros" },
  { symbol: "CXSE3",  sector: "Seguros" },
  { symbol: "PSSA3",  sector: "Seguros" },
  { symbol: "SULA11", sector: "Seguros" },
  { symbol: "IRBR3",  sector: "Seguros" },
  { symbol: "WIZC3",  sector: "Seguros" },
  // Consumo & Alimentos
  { symbol: "AMBEV3", sector: "Consumo" },
  { symbol: "MDIA3",  sector: "Consumo" },
  { symbol: "GRND3",  sector: "Consumo" },
  { symbol: "VULC3",  sector: "Consumo" },
  { symbol: "RANI3",  sector: "Consumo" },
  { symbol: "SMTO3",  sector: "Consumo" },
  { symbol: "JALL3",  sector: "Consumo" },
  { symbol: "BRFS3",  sector: "Consumo" },
  { symbol: "MRFG3",  sector: "Consumo" },
  { symbol: "BEEF3",  sector: "Consumo" },
  { symbol: "CRFB3",  sector: "Consumo" },
  // Saúde
  { symbol: "FLRY3",  sector: "Saúde" },
  { symbol: "HAPV3",  sector: "Saúde" },
  { symbol: "DASA3",  sector: "Saúde" },
  { symbol: "RDOR3",  sector: "Saúde" },
  { symbol: "HYPE3",  sector: "Saúde" },
  // Logística & Transporte
  { symbol: "RAIL3",  sector: "Logística" },
  { symbol: "POMO4",  sector: "Logística" },
  { symbol: "CCRO3",  sector: "Logística" },
  { symbol: "ECOR3",  sector: "Logística" },
  { symbol: "TGMA3",  sector: "Logística" },
  { symbol: "STBP3",  sector: "Logística" },
  { symbol: "HBSA3",  sector: "Logística" },
  // Indústria
  { symbol: "WEGE3",  sector: "Indústria" },
  { symbol: "TUPY3",  sector: "Indústria" },
  { symbol: "UNIP6",  sector: "Indústria" },
  { symbol: "FRAS3",  sector: "Indústria" },
  { symbol: "INEP4",  sector: "Indústria" },
  { symbol: "KEPL3",  sector: "Indústria" },
  { symbol: "ROMI3",  sector: "Indústria" },
  { symbol: "MYPK3",  sector: "Indústria" },
  // Varejo & Imóveis
  { symbol: "ALPA4",  sector: "Varejo" },
  { symbol: "EVEN3",  sector: "Varejo" },
  { symbol: "CYRE3",  sector: "Varejo" },
  { symbol: "LREN3",  sector: "Varejo" },
  { symbol: "TEND3",  sector: "Varejo" },
  { symbol: "MULT3",  sector: "Varejo" },
  // Serviços Financeiros
  { symbol: "B3SA3",  sector: "Serviços Financeiros" },
  { symbol: "CIEL3",  sector: "Serviços Financeiros" },
  // Agronegócio
  { symbol: "SLCE3",  sector: "Agronegócio" },
  { symbol: "AGRO3",  sector: "Agronegócio" },
  { symbol: "TTEN3",  sector: "Agronegócio" },
];

export const SECTOR_MAP: Record<string, string> = Object.fromEntries(
  B3_SECTORS.map(({ symbol, sector }) => [symbol, sector])
);

export function getSector(symbol: string, brapiSector?: string | null): string {
  return SECTOR_MAP[symbol] ?? brapiSector ?? "Outros";
}
