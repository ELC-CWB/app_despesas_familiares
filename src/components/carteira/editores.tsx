"use client";

import { useState } from "react";
import { Loader2, X } from "lucide-react";
import {
  COR_HEX, COR_IDS, MERCADO_CORRETORA_NOME, MERCADO_NOME, MOEDAS, TIPOS_ATIVO,
  type Mercado, type MercadoCorretora, type Moeda, type TipoAtivo,
} from "@/lib/carteira/constantes";
import { fmtNum } from "@/lib/carteira/numeros";
import {
  alvoDoBloco, alvosFecham100, bandaSugerida, resumoSoma, somaAlvos, taxaMediaPonderada, tonsDosBlocos,
} from "@/lib/carteira/regras";
import { novoId } from "@/lib/carteira/ids";
import type { Ativo, Bloco, Corretora, Geografia } from "@/lib/carteira/tipos";
import { BotaoAdicionar, Campo, DecimalInput, Faixa, inputCls, Paleta, VERMELHO } from "@/components/carteira/campos";

// ── utilidades ─────────────────────────────────────────────────────────────────

function atualizar<T extends { id: string }>(lista: T[], id: string, patch: Partial<T>): T[] {
  return lista.map((x) => (x.id === id ? { ...x, ...patch } : x));
}

const pp = (v: number) => fmtNum(v, 0, 2);

function BotaoRemover({ titulo, onClick, bloqueado, disabled }: {
  titulo: string; onClick: () => void; bloqueado?: boolean; disabled?: boolean;
}) {
  return (
    <button type="button" title={titulo} aria-label={titulo} onClick={onClick} disabled={bloqueado || disabled}
      className="p-1.5 rounded-lg transition-colors hover:bg-secondary/60 disabled:cursor-not-allowed flex-shrink-0"
      style={{ color: bloqueado ? "var(--muted-foreground)" : VERMELHO, opacity: bloqueado ? 0.4 : 1 }}>
      <X className="h-4 w-4" />
    </button>
  );
}

// Ticker sugerido para a fonte de cotação: B3 usa o sufixo .SA
export function tickerSugerido(codigo: string, mercado: Mercado): string | null {
  const c = codigo.trim().toUpperCase();
  return c && mercado === "brasil" ? `${c}.SA` : null;
}

// ── Geografias ─────────────────────────────────────────────────────────────────

export function GeografiasEditor({
  geografias, blocos, ativos, onChange, disabled,
}: {
  geografias: Geografia[];
  blocos: Bloco[];
  ativos: Ativo[];
  onChange: (g: Geografia[]) => void;
  disabled?: boolean;
}) {
  const adicionar = () => {
    const usadas = geografias.map((g) => g.cor);
    const cor = COR_IDS.find((c) => !usadas.includes(c)) ?? COR_IDS[0];
    onChange([...geografias, { id: novoId(), nome: "", cor, ordem: geografias.length }]);
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-bold text-foreground">Geografias</h3>
        {!disabled && <BotaoAdicionar onClick={adicionar}>+ Adicionar geografia</BotaoAdicionar>}
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {geografias.map((g) => {
          const bs = blocos.filter((b) => b.geografia_id === g.id);
          const alvo = somaAlvos(ativos.filter((a) => bs.some((b) => b.id === a.bloco_id)));
          const bloqueado = bs.length > 0;
          return (
            <div key={g.id} className="rounded-xl border border-border p-3 space-y-3">
              <div className="flex items-end gap-2">
                <span className="w-3 h-3 rounded-full mb-3 flex-shrink-0" style={{ backgroundColor: COR_HEX[g.cor] }} />
                <Campo label="Nome" className="flex-1">
                  <input className={inputCls} value={g.nome} placeholder="ex.: Global" disabled={disabled}
                    onChange={(e) => onChange(atualizar(geografias, g.id, { nome: e.target.value }))} />
                </Campo>
                {!disabled && (
                  <BotaoRemover
                    titulo={bs.length ? "Mova ou remova os blocos desta geografia antes" : "Remover geografia"}
                    bloqueado={bloqueado}
                    onClick={() => onChange(geografias.filter((x) => x.id !== g.id))} />
                )}
              </div>
              <div>
                <span className="text-xs font-semibold text-muted-foreground mb-1.5 block">Cor</span>
                <Paleta valor={g.cor} disabled={disabled}
                  onEscolher={(cor) => onChange(atualizar(geografias, g.id, { cor }))} />
              </div>
              <p className="text-[11px] text-muted-foreground">
                Alvo {pp(alvo)}% · {bs.length} {bs.length === 1 ? "bloco" : "blocos"}
                {bs.length > 0 && `: ${bs.map((b) => b.nome || "Sem nome").join(", ")}`}
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Blocos ─────────────────────────────────────────────────────────────────────

export function BlocosEditor({
  blocos, geografias, ativos, onChange, disabled, compacto = false,
}: {
  blocos: Bloco[];
  geografias: Geografia[];
  ativos: Ativo[];
  onChange: (b: Bloco[]) => void;
  disabled?: boolean;
  compacto?: boolean; // Primeiros passos: só nome e geografia
}) {
  const tons = tonsDosBlocos(geografias, blocos);
  const adicionar = () => onChange([...blocos, {
    id: novoId(), geografia_id: geografias[0]?.id ?? "", nome: "", nome_curto: null, banda_pp: null, ordem: blocos.length,
  }]);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-bold text-foreground">Blocos</h3>
        {!disabled && <BotaoAdicionar onClick={adicionar}>+ Adicionar bloco</BotaoAdicionar>}
      </div>
      <div className="space-y-2">
        {blocos.map((b) => {
          const doBloco = ativos.filter((a) => a.bloco_id === b.id);
          const alvo = alvoDoBloco(b.id, ativos);
          return (
            <div key={b.id} className="rounded-xl border border-border p-3">
              <div className="flex items-start gap-2">
                <span className="w-3 h-3 rounded-sm mt-8 flex-shrink-0" style={{ backgroundColor: tons[b.id] ?? "#E3E8ED" }} />
                <div className={`grid gap-3 flex-1 min-w-0 grid-cols-2 ${compacto ? "sm:grid-cols-2" : "sm:grid-cols-4"}`}>
                  <Campo label="Nome" className="col-span-2 sm:col-span-1">
                    <input className={inputCls} value={b.nome} placeholder="ex.: Ações globais" disabled={disabled}
                      onChange={(e) => onChange(atualizar(blocos, b.id, { nome: e.target.value }))} />
                  </Campo>
                  {!compacto && (
                    <Campo label="Nome no gráfico">
                      <input className={inputCls} value={b.nome_curto ?? ""} placeholder={b.nome || "opcional"} disabled={disabled}
                        onChange={(e) => onChange(atualizar(blocos, b.id, { nome_curto: e.target.value || null }))} />
                    </Campo>
                  )}
                  <Campo label="Geografia">
                    <select className={inputCls} value={b.geografia_id} disabled={disabled}
                      onChange={(e) => onChange(atualizar(blocos, b.id, { geografia_id: e.target.value }))}>
                      {!geografias.some((g) => g.id === b.geografia_id) && <option value="">Escolha…</option>}
                      {geografias.map((g) => <option key={g.id} value={g.id}>{g.nome || "Sem nome"}</option>)}
                    </select>
                  </Campo>
                  {!compacto && (
                    <Campo label="Banda ± p.p." nota={b.banda_pp == null ? `Vazio: regra 5/25 (±${pp(bandaSugerida(alvo))})` : undefined}>
                      <DecimalInput value={b.banda_pp} disabled={disabled} ariaLabel="Banda do bloco em pontos percentuais"
                        placeholder={pp(bandaSugerida(alvo))}
                        onValue={(v) => onChange(atualizar(blocos, b.id, { banda_pp: v }))} />
                    </Campo>
                  )}
                </div>
                {!disabled && (
                  <BotaoRemover
                    titulo={doBloco.length ? "Mova os ativos deste bloco antes de removê-lo" : "Remover bloco"}
                    bloqueado={doBloco.length > 0}
                    onClick={() => onChange(blocos.filter((x) => x.id !== b.id))} />
                )}
              </div>
              {!compacto && (
                <p className="text-[11px] text-muted-foreground mt-2 pl-5">
                  Alvo {pp(alvo)}% · Ativos: {doBloco.length ? doBloco.map((a) => a.codigo || "—").join(", ") : "nenhum"}
                </p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Ativos ─────────────────────────────────────────────────────────────────────

export function novoAtivo(blocoId: string, corretoraId: string | null, ordem: number): Ativo {
  return {
    id: novoId(), codigo: "", ticker_cotacao: null, tipo: "etf_acoes", mercado: "brasil", moeda: "BRL",
    bloco_id: blocoId, corretora_id: corretoraId, gestora: null, alvo_pct: 0, banda_pp: null, taxa_adm_pct: 0, ordem,
  };
}

export function AtivosEditor({
  ativos, blocos, corretoras, onChange, disabled, compacto = false,
}: {
  ativos: Ativo[];
  blocos: Bloco[];
  corretoras: Corretora[];
  onChange: (a: Ativo[]) => void;
  disabled?: boolean;
  compacto?: boolean; // Primeiros passos: código, tipo, mercado, bloco, alvo e banda
}) {
  const soma = somaAlvos(ativos);
  const somaOk = alvosFecham100(soma);
  const [conferencia, setConferencia] = useState<Record<string, ResultadoTicker>>({});
  const [conferindo, setConferindo] = useState(false);

  // Confere na fonte (Yahoo) se cada ticker existe e em que moeda vem
  const conferirTickers = async () => {
    const tickers = [...new Set(ativos.map((a) => a.ticker_cotacao).filter((t): t is string => !!t))];
    if (!tickers.length) return;
    setConferindo(true);
    try {
      const res = await fetch(`/api/carteira/cotacoes/verificar?t=${encodeURIComponent(tickers.join(","))}`);
      const json = await res.json();
      setConferencia(Object.fromEntries((json.resultados ?? []).map((r: ResultadoTicker) => [r.ticker, r])));
    } finally {
      setConferindo(false);
    }
  };

  const mudarCodigo = (a: Ativo, codigo: string) => {
    const cod = codigo.toUpperCase();
    // Ticker acompanha o código enquanto for o sugerido (ou vazio)
    const acompanha = !a.ticker_cotacao || a.ticker_cotacao === tickerSugerido(a.codigo, a.mercado);
    onChange(atualizar(ativos, a.id, { codigo: cod, ...(acompanha ? { ticker_cotacao: tickerSugerido(cod, a.mercado) } : {}) }));
  };

  const mudarMercado = (a: Ativo, mercado: Mercado) => {
    const moeda: Moeda = mercado === "exterior" ? (a.moeda === "BRL" ? "USD" : a.moeda) : "BRL";
    const acompanha = !a.ticker_cotacao || a.ticker_cotacao === tickerSugerido(a.codigo, a.mercado);
    onChange(atualizar(ativos, a.id, { mercado, moeda, ...(acompanha ? { ticker_cotacao: tickerSugerido(a.codigo, mercado) } : {}) }));
  };

  const preencherBandas = () => onChange(ativos.map((a) => ({ ...a, banda_pp: bandaSugerida(a.alvo_pct) })));

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        {ativos.map((a) => (
          <div key={a.id} className="rounded-xl border border-border p-3">
            <div className="flex items-start gap-2">
              <div className="grid gap-3 flex-1 min-w-0 grid-cols-2 sm:grid-cols-3 lg:grid-cols-6">
                <Campo label="Código">
                  <input className={`${inputCls} font-semibold uppercase`} value={a.codigo} placeholder="ex.: QLBR11" disabled={disabled}
                    onChange={(e) => mudarCodigo(a, e.target.value)} />
                </Campo>
                <Campo label="Tipo" className="col-span-2 sm:col-span-2 lg:col-span-1">
                  <select className={inputCls} value={a.tipo} disabled={disabled}
                    onChange={(e) => onChange(atualizar(ativos, a.id, { tipo: e.target.value as TipoAtivo }))}>
                    {TIPOS_ATIVO.map((t) => <option key={t.id} value={t.id}>{t.nome}</option>)}
                  </select>
                </Campo>
                <Campo label="Mercado">
                  <select className={inputCls} value={a.mercado} disabled={disabled}
                    onChange={(e) => mudarMercado(a, e.target.value as Mercado)}>
                    {(Object.keys(MERCADO_NOME) as Mercado[]).map((m) => <option key={m} value={m}>{MERCADO_NOME[m]}</option>)}
                  </select>
                </Campo>
                {!compacto && (
                  <Campo label="Moeda">
                    <select className={inputCls} value={a.moeda} disabled={disabled || a.mercado === "brasil"}
                      onChange={(e) => onChange(atualizar(ativos, a.id, { moeda: e.target.value as Moeda }))}>
                      {MOEDAS.map((m) => <option key={m} value={m}>{m}</option>)}
                    </select>
                  </Campo>
                )}
                <Campo label="Bloco">
                  <select className={inputCls} value={a.bloco_id} disabled={disabled}
                    onChange={(e) => onChange(atualizar(ativos, a.id, { bloco_id: e.target.value }))}>
                    {!blocos.some((b) => b.id === a.bloco_id) && <option value="">Escolha…</option>}
                    {blocos.map((b) => <option key={b.id} value={b.id}>{b.nome || "Sem nome"}</option>)}
                  </select>
                </Campo>
                <Campo label="Alvo %">
                  <DecimalInput value={a.alvo_pct} disabled={disabled} ariaLabel="Alvo em percentual"
                    onValue={(v) => onChange(atualizar(ativos, a.id, { alvo_pct: v ?? 0 }))} />
                </Campo>
                <Campo label="Banda ± p.p.">
                  <DecimalInput value={a.banda_pp} disabled={disabled} ariaLabel="Banda em pontos percentuais"
                    placeholder={pp(bandaSugerida(a.alvo_pct))}
                    onValue={(v) => onChange(atualizar(ativos, a.id, { banda_pp: v }))} />
                </Campo>
                {!compacto && (
                  <>
                    <Campo label="Taxa adm. % a.a.">
                      <DecimalInput value={a.taxa_adm_pct} disabled={disabled} ariaLabel="Taxa de administração ao ano"
                        onValue={(v) => onChange(atualizar(ativos, a.id, { taxa_adm_pct: v ?? 0 }))} />
                    </Campo>
                    <Campo label="Corretora">
                      <select className={inputCls} value={a.corretora_id ?? ""} disabled={disabled}
                        onChange={(e) => onChange(atualizar(ativos, a.id, { corretora_id: e.target.value || null }))}>
                        <option value="">—</option>
                        {corretoras.map((c) => <option key={c.id} value={c.id}>{c.nome || "Sem nome"}</option>)}
                      </select>
                    </Campo>
                    <Campo label="Ticker da cotação">
                      <input className={inputCls} value={a.ticker_cotacao ?? ""} disabled={disabled}
                        placeholder={a.mercado === "exterior" ? "ex.: VALU.L" : tickerSugerido(a.codigo || "XXXX11", "brasil") ?? ""}
                        onChange={(e) => onChange(atualizar(ativos, a.id, { ticker_cotacao: e.target.value.toUpperCase() || null }))} />
                    </Campo>
                    <Campo label="Gestora" className="col-span-2 sm:col-span-1">
                      <input className={inputCls} value={a.gestora ?? ""} placeholder="opcional" disabled={disabled}
                        onChange={(e) => onChange(atualizar(ativos, a.id, { gestora: e.target.value || null }))} />
                    </Campo>
                  </>
                )}
              </div>
              {!disabled && (
                <BotaoRemover titulo="Remover ativo" onClick={() => onChange(ativos.filter((x) => x.id !== a.id))} />
              )}
            </div>
            {!compacto && a.ticker_cotacao && conferencia[a.ticker_cotacao] && (
              <ConferenciaTicker r={conferencia[a.ticker_cotacao]} moedaAtivo={a.moeda} />
            )}
          </div>
        ))}
      </div>

      {!disabled && (
        <div className="flex flex-wrap items-center gap-2">
          <BotaoAdicionar disabled={!blocos.length}
            onClick={() => onChange([...ativos, novoAtivo(blocos[0]?.id ?? "", corretoras[0]?.id ?? null, ativos.length)])}>
            + Adicionar ativo
          </BotaoAdicionar>
          {!blocos.length && (
            <span className="text-xs text-muted-foreground">Cadastre um bloco em Geografias e blocos antes de adicionar ativos.</span>
          )}
          <button type="button" onClick={preencherBandas}
            className="px-3 py-1.5 rounded-lg text-xs font-bold border border-border text-muted-foreground hover:bg-secondary/50 transition-colors">
            Preencher bandas pela regra 5/25
          </button>
          {!compacto && ativos.some((a) => a.ticker_cotacao) && (
            <button type="button" onClick={conferirTickers} disabled={conferindo}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold border border-border text-muted-foreground hover:bg-secondary/50 transition-colors disabled:opacity-60">
              {conferindo && <Loader2 className="h-3 w-3 animate-spin" />}
              Conferir tickers na fonte
            </button>
          )}
        </div>
      )}

      <p className="text-[11px] text-muted-foreground leading-relaxed">
        Regra 5/25: a banda de cada ativo é 25% do alvo, limitada a 5 pontos. Um ativo com alvo de 10% pode variar entre 7,5% e 12,5%
        antes de ser considerado fora da estratégia. Banda vazia usa essa regra.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Faixa ok={somaOk} tom={compacto ? "ambar" : "vermelho"}>Soma dos alvos: {resumoSoma(soma, (v) => fmtNum(v, 1, 2))}</Faixa>
        {!compacto && (
          <div className="rounded-lg px-3 py-2 text-sm font-semibold bg-secondary/40 text-foreground">
            Taxa média ponderada: {fmtNum(taxaMediaPonderada(ativos), 2, 2)}% a.a.
          </div>
        )}
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
        {blocos.map((b) => (
          <span key={b.id}>{b.nome || "Sem nome"}: <strong className="text-foreground tabular-nums">{fmtNum(alvoDoBloco(b.id, ativos), 1, 2)}%</strong></span>
        ))}
      </div>
    </div>
  );
}

type ResultadoTicker = {
  ticker: string; ok: boolean; nome?: string | null; moeda?: string | null; moedaOriginal?: string | null;
  preco?: number; data?: string;
};

function ConferenciaTicker({ r, moedaAtivo }: { r: ResultadoTicker; moedaAtivo: string }) {
  if (!r.ok) {
    return <p className="text-[11px] font-medium mt-2" style={{ color: VERMELHO }}>✗ {r.ticker} não encontrado na fonte de cotações. Confira o ticker.</p>;
  }
  const moedaDifere = r.moeda && r.moeda !== moedaAtivo;
  return (
    <p className="text-[11px] mt-2 text-muted-foreground">
      <span style={{ color: moedaDifere ? VERMELHO : "#2E6B3F" }} className="font-semibold">{moedaDifere ? "!" : "✓"}</span>{" "}
      {r.nome ?? r.ticker} · {r.moeda}{r.moedaOriginal && r.moedaOriginal !== r.moeda ? ` (vem em ${r.moedaOriginal}, convertido)` : ""}
      {r.preco != null && ` ${fmtNum(r.preco, 2, 4)}`}
      {moedaDifere && <span className="font-semibold" style={{ color: VERMELHO }}> · A cotação vem em {r.moeda}, mas o ativo está cadastrado em {moedaAtivo}.</span>}
    </p>
  );
}

// ── Corretora ──────────────────────────────────────────────────────────────────

function exemploCorretagem(pct: number, minimo: number, moeda: "R$ " | "US$ ", valores: number[]): string {
  return valores.map((v) => {
    const custo = Math.max((v * pct) / 100, minimo);
    return `ordem de ${moeda}${fmtNum(v)} paga ${moeda}${fmtNum(custo, 2, 2)} (${fmtNum(v ? (custo / v) * 100 : 0, 0, 2)}%)`;
  }).join("; ") + ".";
}

export function CorretoraEditor({
  corretora, onChange, disabled, onRemover, ativosTxt,
}: {
  corretora: Corretora;
  onChange: (c: Corretora) => void;
  disabled?: boolean;
  onRemover?: () => void;
  ativosTxt?: string;
}) {
  const c = corretora;
  const set = (patch: Partial<Corretora>) => onChange({ ...c, ...patch });
  const temBr = c.mercado !== "exterior";
  const temExt = c.mercado !== "brasil";
  const numCampo = (label: string, k: keyof Corretora, nota?: string) => (
    <Campo label={label} nota={nota}>
      <DecimalInput value={c[k] as number} disabled={disabled} ariaLabel={label} onValue={(v) => set({ [k]: v ?? 0 } as Partial<Corretora>)} />
    </Campo>
  );

  return (
    <div className="rounded-xl border border-border p-3 sm:p-4 space-y-4">
      <div className="flex items-end gap-2">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 flex-1">
          <Campo label="Nome da corretora">
            <input className={inputCls} value={c.nome} placeholder="ex.: Banco Inter" disabled={disabled}
              onChange={(e) => set({ nome: e.target.value })} />
          </Campo>
          <Campo label="Opera em">
            <select className={inputCls} value={c.mercado} disabled={disabled}
              onChange={(e) => set({ mercado: e.target.value as MercadoCorretora })}>
              {(Object.keys(MERCADO_CORRETORA_NOME) as MercadoCorretora[]).map((m) => (
                <option key={m} value={m}>{MERCADO_CORRETORA_NOME[m]}</option>
              ))}
            </select>
          </Campo>
          {numCampo("Custódia (% ao ano)", "custodia_pct")}
        </div>
        {onRemover && !disabled && <BotaoRemover titulo="Remover corretora" onClick={onRemover} />}
      </div>

      {temBr && (
        <div className="space-y-2">
          <h4 className="text-xs font-bold text-foreground uppercase tracking-wide">Corretagem na B3</h4>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {numCampo("Percentual da ordem (%)", "corr_br_pct")}
            {numCampo("Mínimo por ordem (R$)", "corr_br_min")}
            {numCampo("Emolumentos B3 (%)", "emolumentos_pct")}
          </div>
          <p className="text-[11px] text-muted-foreground">
            Exemplo: {exemploCorretagem(c.corr_br_pct, c.corr_br_min, "R$ ", [1000, 10000])}
          </p>
        </div>
      )}

      {temExt && (
        <div className="space-y-2">
          <h4 className="text-xs font-bold text-foreground uppercase tracking-wide">Exterior: câmbio e corretagem</h4>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            {numCampo("Spread cambial (%)", "spread_pct")}
            {numCampo("IOF na remessa (%)", "iof_ida_pct")}
            {numCampo("IOF no retorno (%)", "iof_volta_pct")}
            {numCampo("Corretagem (% da ordem)", "corr_ext_pct")}
            {numCampo("Corretagem mínima por ordem (US$)", "corr_ext_min_usd")}
          </div>
          <p className="text-[11px] text-muted-foreground">
            Exemplo: {exemploCorretagem(c.corr_ext_pct, c.corr_ext_min_usd, "US$ ", [500, 3000])}{" "}
            Remessa de R$ 10.000 custa R$ {fmtNum((10000 * (c.spread_pct + c.iof_ida_pct)) / 100, 2, 2)}; o retorno
            de R$ 10.000 custa R$ {fmtNum((10000 * (c.spread_pct + c.iof_volta_pct)) / 100, 2, 2)}. Confira o IOF com a corretora.
          </p>
        </div>
      )}

      {ativosTxt && <p className="text-[11px] text-muted-foreground">{ativosTxt}</p>}
    </div>
  );
}
