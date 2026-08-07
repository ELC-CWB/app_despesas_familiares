// Same ticker set as SECTOR_MAP (src/lib/investments/sectors.ts) — Yahoo Finance's
// crumb/cookie scraping is unreliable (frequently rate-limited), so company names
// are kept as a static map instead, same approach as sectors.
const B3_COMPANY_NAMES: { symbol: string; name: string }[] = [
  // Bancos
  { symbol: "ITUB4",  name: "Itaú Unibanco" },
  { symbol: "BBDC4",  name: "Bradesco" },
  { symbol: "SANB11", name: "Santander Brasil" },
  { symbol: "BBAS3",  name: "Banco do Brasil" },
  { symbol: "BPAC11", name: "BTG Pactual" },
  { symbol: "BRSR6",  name: "Banrisul" },
  { symbol: "ABCB4",  name: "Banco ABC Brasil" },
  { symbol: "BMGB4",  name: "Banco BMG" },
  { symbol: "ITSA4",  name: "Itaúsa" },
  { symbol: "BPAN4",  name: "Banco Pan" },
  { symbol: "PINE4",  name: "Banco Pine" },
  { symbol: "BGIP4",  name: "Banese" },
  // Energia Elétrica
  { symbol: "EGIE3",  name: "Engie Brasil" },
  { symbol: "CPFE3",  name: "CPFL Energia" },
  { symbol: "TRPL4",  name: "ISA CTEEP" },
  { symbol: "ENGI11", name: "Energisa" },
  { symbol: "TAEE11", name: "Taesa" },
  { symbol: "CMIG4",  name: "Cemig" },
  { symbol: "CPLE6",  name: "Copel" },
  { symbol: "ENBR3",  name: "EDP Brasil" },
  { symbol: "AURE3",  name: "Auren Energia" },
  { symbol: "EQTL3",  name: "Equatorial Energia" },
  { symbol: "NEOE3",  name: "Neoenergia" },
  { symbol: "CESP6",  name: "CESP" },
  { symbol: "ALUP11", name: "Alupar" },
  { symbol: "ENEV3",  name: "Eneva" },
  { symbol: "ELET3",  name: "Eletrobras" },
  { symbol: "EMAE4",  name: "EMAE" },
  { symbol: "AESB3",  name: "AES Brasil" },
  // Saneamento
  { symbol: "SAPR11", name: "Sanepar" },
  { symbol: "CSMG3",  name: "Copasa" },
  { symbol: "SBSP3",  name: "Sabesp" },
  // Petróleo & Gás
  { symbol: "PETR4",  name: "Petrobras" },
  { symbol: "PRIO3",  name: "PetroRio" },
  { symbol: "RRRP3",  name: "3R Petroleum" },
  { symbol: "RECV3",  name: "PetroRecôncavo" },
  { symbol: "VBBR3",  name: "Vibra Energia" },
  { symbol: "CGAS5",  name: "Comgás" },
  // Mineração & Siderurgia
  { symbol: "VALE3",  name: "Vale" },
  { symbol: "CMIN3",  name: "CSN Mineração" },
  { symbol: "CSNA3",  name: "CSN" },
  { symbol: "GGBR4",  name: "Gerdau" },
  { symbol: "GOAU4",  name: "Metalúrgica Gerdau" },
  { symbol: "FESA4",  name: "Ferbasa" },
  { symbol: "BRAP4",  name: "Bradespar" },
  { symbol: "USIM5",  name: "Usiminas" },
  { symbol: "KLBN11", name: "Klabin" },
  { symbol: "SUZB3",  name: "Suzano" },
  { symbol: "DXCO3",  name: "Dexco" },
  // Telecom
  { symbol: "VIVT3",  name: "Telefônica Brasil (Vivo)" },
  { symbol: "TIMS3",  name: "TIM" },
  { symbol: "TELB4",  name: "Telebras" },
  // Seguros
  { symbol: "BBSE3",  name: "BB Seguridade" },
  { symbol: "CXSE3",  name: "Caixa Seguridade" },
  { symbol: "PSSA3",  name: "Porto Seguro" },
  { symbol: "SULA11", name: "SulAmérica" },
  { symbol: "IRBR3",  name: "IRB Brasil RE" },
  { symbol: "WIZC3",  name: "Wiz Conseg" },
  // Consumo & Alimentos
  { symbol: "AMBEV3", name: "Ambev" },
  { symbol: "MDIA3",  name: "M. Dias Branco" },
  { symbol: "GRND3",  name: "Grendene" },
  { symbol: "VULC3",  name: "Vulcabras" },
  { symbol: "RANI3",  name: "Irani" },
  { symbol: "SMTO3",  name: "São Martinho" },
  { symbol: "JALL3",  name: "Jalles Machado" },
  { symbol: "BRFS3",  name: "BRF" },
  { symbol: "MRFG3",  name: "Marfrig" },
  { symbol: "BEEF3",  name: "Minerva" },
  { symbol: "CRFB3",  name: "Carrefour Brasil" },
  // Saúde
  { symbol: "FLRY3",  name: "Fleury" },
  { symbol: "HAPV3",  name: "Hapvida" },
  { symbol: "DASA3",  name: "Dasa" },
  { symbol: "RDOR3",  name: "Rede D'Or" },
  { symbol: "HYPE3",  name: "Hypera" },
  // Logística & Transporte
  { symbol: "RAIL3",  name: "Rumo" },
  { symbol: "POMO4",  name: "Marcopolo" },
  { symbol: "CCRO3",  name: "CCR" },
  { symbol: "ECOR3",  name: "EcoRodovias" },
  { symbol: "TGMA3",  name: "Tegma" },
  { symbol: "STBP3",  name: "Santos Brasil" },
  { symbol: "HBSA3",  name: "Hidrovias do Brasil" },
  // Indústria
  { symbol: "WEGE3",  name: "WEG" },
  { symbol: "TUPY3",  name: "Tupy" },
  { symbol: "UNIP6",  name: "Unipar" },
  { symbol: "FRAS3",  name: "Fras-le" },
  { symbol: "INEP4",  name: "Inepar" },
  { symbol: "KEPL3",  name: "Kepler Weber" },
  { symbol: "ROMI3",  name: "Indústrias Romi" },
  { symbol: "MYPK3",  name: "Iochpe-Maxion" },
  // Varejo & Imóveis
  { symbol: "ALPA4",  name: "Alpargatas" },
  { symbol: "EVEN3",  name: "Even" },
  { symbol: "CYRE3",  name: "Cyrela" },
  { symbol: "LREN3",  name: "Lojas Renner" },
  { symbol: "TEND3",  name: "Tenda" },
  { symbol: "MULT3",  name: "Multiplan" },
  // Serviços Financeiros
  { symbol: "B3SA3",  name: "B3" },
  { symbol: "CIEL3",  name: "Cielo" },
  // Agronegócio
  { symbol: "SLCE3",  name: "SLC Agrícola" },
  { symbol: "AGRO3",  name: "BrasilAgro" },
  { symbol: "TTEN3",  name: "3tentos" },
];

export const COMPANY_NAME_MAP: Record<string, string> = Object.fromEntries(
  B3_COMPANY_NAMES.map(({ symbol, name }) => [symbol, name])
);

export function getCompanyName(symbol: string): string {
  return COMPANY_NAME_MAP[symbol] ?? symbol;
}
