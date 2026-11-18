import { describe, expect, it } from "vitest";
import { lerYahooSummary, montarInfo, CATALOGO } from "./ativo-info";

const base = { codigo: "LFTS11", ticker_cotacao: "LFTS11.SA", tipo: "etf_rf" as const, gestora: "Investo", taxa_adm_pct: 0.2, sede: "Brasil" };

describe("links das fontes do catálogo", () => {
  it("cada fonte leva à página do ativo, não à página inicial de um site", () => {
    for (const [codigo, e] of Object.entries(CATALOGO)) {
      expect(e.fontes.length, codigo).toBeGreaterThan(0);
      for (const f of e.fontes) {
        const u = new URL(f.url);
        expect(u.protocol, `${codigo} ${f.url}`).toBe("https:");
        expect(u.pathname.length, `${codigo} ${f.url}`).toBeGreaterThan(1);
      }
    }
  });
  it("não usa investo.com.br, que redireciona para outra empresa", () => {
    const urls = Object.values(CATALOGO).flatMap((e) => e.fontes.map((f) => f.url));
    expect(urls.some((u) => u.includes("investo.com.br"))).toBe(false);
  });
});

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
