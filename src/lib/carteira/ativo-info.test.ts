import { describe, expect, it } from "vitest";
import { lerYahooSummary, montarInfo, CATALOGO } from "./ativo-info";

const base = { codigo: "LFTS11", ticker_cotacao: "LFTS11.SA", tipo: "etf_rf" as const, gestora: "Investo", taxa_adm_pct: 0.2, sede: "Brasil" };

describe("ficha do ativo", () => {
  it("ETF do catálogo traz descrição, índice e fonte, mesmo sem Yahoo", () => {
    const i = montarInfo(base, null);
    expect(i.descricao).toBe(CATALOGO.LFTS11.descricao);
    expect(i.destaques.find((d) => d.rotulo === "Índice de referência")?.valor).toContain("Selic");
    expect(i.fontes.length).toBeGreaterThan(0);
    expect(i.nome).toBe("LFTS11");
  });
  it("ação usa a descrição do Yahoo e marca idioma original", () => {
    const y = lerYahooSummary({ price: { longName: "Empresa SA" }, assetProfile: { longBusinessSummary: "Makes things.", sector: "Industrials" } });
    const i = montarInfo({ ...base, codigo: "XPTO3", tipo: "acao", ticker_cotacao: "XPTO3.SA" }, y);
    expect(i.descricao).toBe("Makes things.");
    expect(i.idiomaOriginal).toBe(true);
    expect(i.nome).toBe("Empresa SA");
  });
  it("sem catálogo nem Yahoo, descrição nula (aviso amigável na tela)", () => {
    expect(montarInfo({ ...base, codigo: "ZZZ11" }, null).descricao).toBeNull();
    expect(lerYahooSummary(null)).toBeNull();
  });
});
