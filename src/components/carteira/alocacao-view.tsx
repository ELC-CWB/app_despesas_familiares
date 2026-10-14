"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { NoAlocacao } from "@/lib/carteira/alocacao";
import { calcularSetores } from "@/lib/carteira/grafico";
import { fmtBRL, fmtNum } from "@/lib/carteira/numeros";
import { clarear } from "@/lib/carteira/regras";

// Visão geral (SPEC §4.2): gráfico de rosca em 3 anéis e tabela Real x planejado.
// Passar o mouse (ou tocar) destaca a hierarquia: o item, seus ancestrais e seus descendentes.

const VERMELHO = "#B42318";     // texto fora da banda (sem fundo vermelho)
const VERMELHO_GRAFICO = "#D93A32";
const TEXTO = "#15202B";        // as linhas da tabela têm fundo pastel fixo: texto escuro fixo

const pct1 = (v: number) => `${fmtNum(v, 1, 1)}%`;
const pp = (v: number) => fmtNum(v, 0, 2);
const sinal = (v: number, txt: string) => `${v > 0.0001 ? "+" : v < -0.0001 ? "−" : ""}${txt}`;

// Cartão de ação por fase (SPEC §4.2). Só dados: o componente desenha o cartão.
export type AcaoVisaoGeral =
  | { tipo: "aporte"; codigo: string; falta: number; podeRegistrar: boolean }
  | { tipo: "usufruto" };

export function AlocacaoView({
  nos, semPosicoes, acao,
}: {
  nos: NoAlocacao[];
  semPosicoes: boolean;
  acao?: AcaoVisaoGeral;
}) {
  const [hover, setHover] = useState<string | null>(null);
  const [fixo, setFixo] = useState<string | null>(null);
  const setores = useMemo(() => calcularSetores(nos), [nos]);

  const porId = useMemo(() => new Map(nos.map((n) => [n.id, n])), [nos]);
  const ativo = hover ?? fixo;
  const relacionados = useMemo(() => {
    const r = new Set<string>();
    if (!ativo) return r;
    r.add(ativo);
    for (let p = porId.get(ativo)?.pai; p; p = porId.get(p)?.pai) r.add(p);
    const descer = (id: string) => porId.get(id)?.filhos.forEach((f) => { r.add(f); descer(f); });
    descer(ativo);
    return r;
  }, [ativo, porId]);
  const opacidade = (id: string) => (!ativo || relacionados.has(id) ? 1 : 0.3);
  const alternarFixo = (id: string) => setFixo((f) => (f === id ? null : id));

  const nenhum = setores.length === 0;

  return (
    <div className="grid grid-cols-1 xl:grid-cols-[minmax(340px,420px)_minmax(0,1fr)] gap-3 items-start">
      {/* ── Alocação planejada ── */}
      <section className="rounded-2xl border border-border bg-card p-3 sm:p-4 shadow-sm space-y-2">
        <h2 className="text-base font-bold text-foreground" style={{ fontFamily: "Sora, sans-serif" }}>Alocação planejada</h2>

        {nenhum ? (
          <p className="text-sm text-muted-foreground py-10 text-center">
            Defina os alvos dos ativos em Configurações para ver o gráfico.
          </p>
        ) : (
          <>
            {/* O tamanho acompanha a altura da janela (o bloco inteiro cabe sem rolar); entre 200 e 388 px */}
            <div className="relative w-full aspect-square mx-auto" style={{ maxWidth: "clamp(200px, calc(100dvh - 372px), 388px)" }}>
              <svg viewBox="0 0 400 400" className="w-full h-full block" role="img"
                aria-label="Gráfico de alocação por geografia, bloco e ativo, com os desvios fora da banda em vermelho">
                <defs>
                  <pattern id="hachuraVermelha" width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                    <rect width="3.5" height="7" fill={VERMELHO_GRAFICO} />
                  </pattern>
                </defs>
                {setores.map((s) => {
                  const no = porId.get(s.id)!;
                  return (
                    <g key={s.id} opacity={opacidade(s.id)} style={{ cursor: "pointer" }} tabIndex={0} role="button"
                      aria-label={`${no.nome}: ${pct1(no.real)} real, alvo ${pct1(no.alvo)}`}
                      onMouseEnter={() => setHover(s.id)} onMouseLeave={() => setHover(null)}
                      onFocus={() => setHover(s.id)} onBlur={() => setHover(null)}
                      onClick={() => alternarFixo(s.id)}
                      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); alternarFixo(s.id); } }}>
                      <path d={s.d} fill={no.cor} style={{ stroke: "var(--card)" }} strokeWidth={2} />
                      {s.desvio && (
                        <path d={s.desvio} fill={s.tipoDesvio === "sobra" ? VERMELHO_GRAFICO : "url(#hachuraVermelha)"}
                          style={{ stroke: "var(--card)" }} strokeWidth={1} />
                      )}
                    </g>
                  );
                })}
                {/* Rótulos curvos: uma letra por posição, com o topo voltado para fora */}
                {setores.flatMap((s) => s.letras.map((l, i) => (
                  <text key={`${s.id}-${i}`} x={l.x} y={l.y} dy="0.35em" textAnchor="middle" fontSize={l.fs} fontWeight={600}
                    transform={`rotate(${l.rot.toFixed(1)} ${l.x.toFixed(2)} ${l.y.toFixed(2)})`}
                    fill={porId.get(s.id)!.tinta} opacity={opacidade(s.id)} pointerEvents="none"
                    style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace" }}>
                    {l.ch}
                  </text>
                )))}
              </svg>
            </div>
          </>
        )}

        {acao?.tipo === "aporte" && (
          <div className="flex items-center justify-between gap-3 rounded-xl bg-secondary/40 px-3 py-2">
            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground leading-tight">Próximo aporte</p>
              <p className="text-sm text-muted-foreground leading-tight">
                <strong className="text-base text-foreground">{acao.codigo}</strong> · faltam {fmtBRL(acao.falta, 0)}
              </p>
            </div>
            {acao.podeRegistrar && (
              <Link href={`/investments/movimentacoes?op=compra&ativo=${encodeURIComponent(acao.codigo)}`}
                className="px-2.5 py-1.5 rounded-md text-xs font-semibold text-white whitespace-nowrap flex-none" style={{ backgroundColor: "#3b82f6" }}>
                Registrar aporte
              </Link>
            )}
          </div>
        )}
        {acao?.tipo === "usufruto" && (
          <div className="rounded-xl p-4" style={{ backgroundColor: "rgba(138,90,0,0.08)" }}>
            <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: "#8A5A00" }}>Saque do mês</p>
            <p className="text-sm text-muted-foreground mt-1">O saque mensal, com a escolha do ativo, chega em breve nesta tela.</p>
          </div>
        )}
      </section>

      {/* ── Real x planejado ── */}
      <section className="rounded-2xl border border-border bg-card p-3 sm:p-4 shadow-sm space-y-2 min-w-0">
        <h2 className="text-base font-bold text-foreground" style={{ fontFamily: "Sora, sans-serif" }}>Real x planejado</h2>
        <div className="overflow-x-auto -mx-1 px-1">
          <table className="w-full text-sm min-w-[480px]" style={{ borderCollapse: "separate", borderSpacing: 0 }}>
            <thead>
              <tr className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground border-b border-border">
                <th className="px-2.5 py-1.5 text-left font-semibold">Geografia / Bloco / Ativo</th>
                <th className="px-2 py-1.5 text-right font-semibold">Alvo</th>
                <th className="px-2 py-1.5 text-right font-semibold hidden sm:table-cell">Banda</th>
                <th className="px-2 py-1.5 text-right font-semibold">Real</th>
                <th className="px-2 py-1.5 text-right font-semibold">Desvio</th>
                <th className="px-2 py-1.5 text-right font-semibold hidden sm:table-cell">Valor</th>
                <th className="px-2 py-1.5 text-right font-semibold hidden sm:table-cell">Diferença</th>
                <th className="px-2.5 py-1.5 text-left font-semibold">Status</th>
              </tr>
            </thead>
            <tbody>
              {nos.map((n, i) => {
                const estilo = ESTILO[n.nivel];
                const base = n.nivel === 2 ? clarear(n.cor, 0.55) : n.cor;
                const ativoLinha = ativo === n.id;
                // Destaque: contorno contínuo na linha (sombras internas nas células, pois borda de <tr> não é
                // confiável) e a fonte no tom da geografia. As linhas fora da hierarquia ficam esmaecidas.
                // Nada que altere a largura do texto: negrito quebra linhas e desloca a tabela sob o mouse.
                const fundo = ativo && !relacionados.has(n.id) ? clarear(base, 0.45) : base;
                const tinta = n.fora ? VERMELHO : ativoLinha ? n.tinta : TEXTO;
                const celula = "px-2 text-right tabular-nums whitespace-nowrap";
                const contorno = (primeira: boolean, ultima: boolean): React.CSSProperties =>
                  !ativoLinha ? {} : {
                    boxShadow: [
                      `inset 0 2px 0 ${TEXTO}`, `inset 0 -2px 0 ${TEXTO}`,
                      ...(primeira ? [`inset 2px 0 0 ${TEXTO}`] : []), ...(ultima ? [`inset -2px 0 0 ${TEXTO}`] : []),
                    ].join(", "),
                  };
                return (
                  <tr key={n.id} onMouseEnter={() => setHover(n.id)} onMouseLeave={() => setHover(null)}
                    style={{
                      backgroundColor: fundo, color: tinta, fontSize: estilo.tamanho,
                      borderTop: i === 0 ? 0 : n.nivel === 0 ? "6px solid var(--card)" : "1px solid var(--card)",
                    }}>
                    <td className="whitespace-nowrap" style={{ padding: estilo.pad, paddingLeft: 10 + estilo.recuo, ...contorno(true, false) }}>
                      <button type="button" onClick={() => alternarFixo(n.id)}
                        className="text-left leading-tight"
                        style={{ fontWeight: estilo.peso, textTransform: estilo.caixa, letterSpacing: estilo.espaco }}>
                        {n.nome}
                      </button>
                    </td>
                    <td className={celula} style={contorno(false, false)}>{pct1(n.alvo)}</td>
                    <td className={`${celula} hidden sm:table-cell`} style={contorno(false, false)}>{n.banda != null ? `±${pp(n.banda)}` : "—"}</td>
                    <td className={celula} style={{ fontWeight: estilo.peso, ...contorno(false, false) }}>{pct1(n.real)}</td>
                    <td className={celula} style={{ color: n.fora ? VERMELHO : undefined, ...contorno(false, false) }}>
                      {semPosicoes ? "—" : sinal(n.desvio, fmtNum(Math.abs(n.desvio), 1, 1))}
                    </td>
                    <td className={`${celula} hidden sm:table-cell`} style={contorno(false, false)}>{fmtBRL(n.valor, 0)}</td>
                    <td className={`${celula} hidden sm:table-cell`} style={{ color: n.fora ? VERMELHO : undefined, ...contorno(false, false) }}>
                      {semPosicoes ? "—" : sinal(n.diferenca, fmtBRL(Math.abs(n.diferenca), 0))}
                    </td>
                    <td className="px-2.5 whitespace-nowrap text-[11px]" style={contorno(false, true)}>
                      {n.nivel === 0 || semPosicoes ? (
                        <span style={{ opacity: 0.5 }}>—</span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5">
                          <span className="w-2 h-2 rounded-full" style={{ backgroundColor: n.fora ? VERMELHO_GRAFICO : "#B7C1CB" }} />
                          {n.fora ? "Fora da banda" : "Dentro da banda"}
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <details className="text-xs text-muted-foreground">
          <summary className="cursor-pointer font-semibold text-foreground w-fit">Como ler o gráfico</summary>
          <p className="mt-1.5 leading-relaxed">
            Cada fatia tem o tamanho planejado. Desvios dentro da banda são tolerados e não aparecem no gráfico. Fora da banda,
            a parte vermelha no fim da fatia mostra o tamanho do desvio: sólida quando sobra, listrada quando falta.
            A correção sugerida é sempre pelo próximo aporte.
          </p>
        </details>
      </section>
    </div>
  );
}

// Aparência das linhas por nível (protótipo): geografia em maiúsculas, bloco em negrito, ativo recuado
const ESTILO = {
  0: { pad: "7px 0 4px", recuo: 0, peso: 700, tamanho: 10.5, caixa: "uppercase" as const, espaco: "0.06em" },
  1: { pad: "4px 0", recuo: 14, peso: 700, tamanho: 12, caixa: "none" as const, espaco: "normal" },
  2: { pad: "2px 0", recuo: 30, peso: 500, tamanho: 12, caixa: "none" as const, espaco: "normal" },
};
