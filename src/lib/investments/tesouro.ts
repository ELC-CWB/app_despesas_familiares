// Tesouro Transparente — histórico de preços e taxas do Tesouro Direto
// https://www.tesourotransparente.gov.br

const CSV_URL =
  "https://www.tesourotransparente.gov.br/ckan/dataset/df56aa42-484a-4a59-8184-7676580c81e3/resource/796d2059-14e9-44e3-80c9-2d9e30b405c1/download/precotaxatesourodireto.csv";

export type TesouroCategoria = "Pré-fixado" | "Pós-fixado" | "Misto";

export interface TesouroTitulo {
  tipoTitulo: string;
  categoria: TesouroCategoria;
  vencimento: string; // YYYY-MM-DD
  taxa: number;       // % a.a. (Taxa Venda Manha)
  pu: number;          // R$ (PU Venda Manha)
  valorMinimo: number;  // R$ (pu * 1%)
}

export interface TesouroData {
  titulos: TesouroTitulo[];
  dataBase: string | null; // YYYY-MM-DD
}

type CacheEntry = { data: TesouroData; expiresAt: number };
let cache: CacheEntry | null = null;
const TTL_MS = 12 * 60 * 60 * 1000;

function parseBrNumber(s: string): number {
  return parseFloat(s.replace(/\./g, "").replace(",", "."));
}

function brDateToIso(s: string): string | null {
  const parts = s.split("/");
  if (parts.length !== 3) return null;
  const [dd, mm, yyyy] = parts;
  if (dd.length !== 2 || mm.length !== 2 || yyyy.length !== 4) return null;
  return `${yyyy}-${mm}-${dd}`;
}

function categorize(tipoTitulo: string): TesouroCategoria | null {
  if (tipoTitulo.includes("Selic")) return "Pós-fixado";
  if (tipoTitulo.includes("IPCA+")) return "Misto";
  if (tipoTitulo.includes("Prefixado")) return "Pré-fixado";
  return null;
}

function parseCsv(text: string): TesouroData {
  const lines = text.split(/\r?\n/);
  const latest = new Map<string, TesouroTitulo & { dataBase: string }>();

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line) continue;

    const cols = line.split(";");
    if (cols.length !== 8) continue;

    const tipoTitulo = cols[0];
    const vencimento = brDateToIso(cols[1]);
    const dataBase = brDateToIso(cols[2]);
    const taxa = parseBrNumber(cols[4]);
    const pu = parseBrNumber(cols[6]);

    if (!vencimento || !dataBase) continue;
    if (Number.isNaN(taxa) || Number.isNaN(pu) || pu <= 0) continue;

    const categoria = categorize(tipoTitulo);
    if (!categoria) continue;

    const key = `${tipoTitulo}|${vencimento}`;
    const existing = latest.get(key);
    if (!existing || dataBase >= existing.dataBase) {
      latest.set(key, {
        tipoTitulo,
        categoria,
        vencimento,
        taxa,
        pu,
        valorMinimo: Math.round(pu * 0.01 * 100) / 100,
        dataBase,
      });
    }
  }

  let maxDataBase: string | null = null;
  for (const entry of latest.values()) {
    if (!maxDataBase || entry.dataBase > maxDataBase) maxDataBase = entry.dataBase;
  }

  const hojeIso = new Date().toISOString().slice(0, 10);

  const titulos: TesouroTitulo[] = [];
  for (const entry of latest.values()) {
    if (entry.dataBase !== maxDataBase) continue;
    if (entry.vencimento <= hojeIso) continue;
    titulos.push({
      tipoTitulo: entry.tipoTitulo,
      categoria: entry.categoria,
      vencimento: entry.vencimento,
      taxa: entry.taxa,
      pu: entry.pu,
      valorMinimo: entry.valorMinimo,
    });
  }

  titulos.sort((a, b) => a.vencimento.localeCompare(b.vencimento));

  return { titulos, dataBase: maxDataBase };
}

async function fetchTesouroCsv(): Promise<string> {
  const res = await fetch(CSV_URL, { signal: AbortSignal.timeout(20000) });
  if (!res.ok) throw new Error(`Tesouro Transparente respondeu ${res.status}`);
  return res.text();
}

export async function fetchTesouroTitulos(): Promise<TesouroData> {
  if (cache && Date.now() < cache.expiresAt) return cache.data;

  try {
    const csv = await fetchTesouroCsv();
    const data = parseCsv(csv);

    if (data.titulos.length > 0) {
      cache = { data, expiresAt: Date.now() + TTL_MS };
    }

    return data;
  } catch {
    return { titulos: [], dataBase: null };
  }
}
