"use client";

import { valorMaximoBonito } from "@/lib/carteira/grafico";
import { dinheiroCurto } from "@/lib/carteira/plano";

// Gráficos do Plano (SPEC §4.3): túnel entre os cenários e barras de investido líquido + ganho.
// SVG responsivo (viewBox); cores do tema nos textos e na grade.

const AZUL = "#3b82f6";
const VERDE = "#10b981";
const VERMELHO = "#D93A32";
const mil = (v: number) => (v <= 0 ? "R$ 0" : dinheiroCurto(v));
const f1 = (v: number) => v.toFixed(1);

type Ponto = { t: number; v: number };

export function TunelChart({
  anoInicio, anosAporte, horizonte, pess, otim, esgota, patrimonio, hoje, preservar, revisoes = [],
}: {
  anoInicio: number;
  anosAporte: number;
  horizonte: number;
  pess: number[];            // em reais correntes (corrigido pela inflação)
  otim: number[];
  esgota: number;            // ano (t) em que a pessimista se esgota, ou −1
  patrimonio: Ponto[];       // patrimônio nominal ao longo do tempo
  hoje: Ponto | null;
  preservar: number | null;  // patrimônio a preservar (perpétuo)
  revisoes?: { t: number; ano: number }[]; // revisões do plano: linha pontilhada no ano de cada uma
}) {
  const W = 780, H = 330, x0 = 64, x1 = 764, y0 = 24, y1 = 292;
  const T = Math.max(1, horizonte);
  const visiveis = patrimonio.filter((p) => p.t >= 0 && p.t <= T);
  const ymax = valorMaximoBonito(Math.max(...otim, ...visiveis.map((p) => p.v), 1));
  const X = (t: number) => x0 + (t / T) * (x1 - x0);
  const Y = (v: number) => y1 - (v / ymax) * (y1 - y0);
  const pts = (arr: number[]) => arr.map((v, t) => `${f1(X(t))},${f1(Y(v))}`).join(" ");
  const faixa = `${pts(otim)} ${[...pess].map((v, t) => `${f1(X(t))},${f1(Y(v))}`).reverse().join(" ")}`;
  const passo = T > 40 ? 10 : 5;
  const anos = Array.from({ length: Math.floor(T / passo) + 1 }, (_, i) => i * passo);
  const ux = X(anosAporte);
  const fimX = esgota >= 0 ? X(esgota + 1) : null;

  // Rótulos dentro do gráfico, ao lado da linha: se um cair em cima de outro, desce para a linha de baixo
  const larguraTexto = (t: string) => t.length * 6.2; // fonte de 11 px, estimativa
  const posicao = (x: number, t: string) => {
    const aEsquerda = x > 600;
    const a = aEsquerda ? x - 6 - larguraTexto(t) : x + 6;
    return { x: aEsquerda ? x - 6 : x + 6, anchor: aEsquerda ? ("end" as const) : ("start" as const), a, b: a + larguraTexto(t) };
  };
  const ocupados: { a: number; b: number; fila: number }[] = [];
  if (anosAporte < T) {
    const p = posicao(ux, `Início do usufruto · ${anoInicio + anosAporte}`);
    ocupados.push({ a: p.a, b: p.b, fila: 0 });
  }
  const rotulosRev = revisoes.map((r) => {
    const texto = `Rev ${r.ano}`;
    const p = posicao(X(r.t), texto);
    let fila = 0;
    while (ocupados.some((c) => c.fila === fila && p.a < c.b + 6 && p.b > c.a - 6)) fila++;
    ocupados.push({ a: p.a, b: p.b, fila });
    return { ...r, texto, p, fila };
  });

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto block" role="img"
      aria-label="Túnel do plano: faixa entre os cenários pessimista e otimista, com o patrimônio atual">
      {Array.from({ length: 5 }, (_, i) => {
        const v = (ymax * i) / 4;
        return (
          <g key={i}>
            <line x1={x0} x2={x1} y1={Y(v)} y2={Y(v)} style={{ stroke: "hsl(var(--border))" }} strokeWidth={1} />
            <text x={x0 - 8} y={Y(v)} dy="0.35em" textAnchor="end" fontSize={11} className="fill-muted-foreground">{mil(v)}</text>
          </g>
        );
      })}

      {anosAporte < T && (
        <rect x={ux} y={y0} width={x1 - ux} height={y1 - y0} fill="rgba(217,58,50,0.06)" />
      )}
      <polygon points={faixa} fill="rgba(59,130,246,0.16)" />
      <polyline points={pts(otim)} fill="none" stroke={AZUL} strokeWidth={1.5} />
      <polyline points={pts(pess)} fill="none" stroke={AZUL} strokeWidth={1.5} />

      {rotulosRev.map((r) => (
        <g key={r.ano}>
          <line x1={f1(X(r.t))} x2={f1(X(r.t))} y1={y0} y2={y1} style={{ stroke: "hsl(var(--muted-foreground))" }} strokeWidth={1} strokeDasharray="4 3" opacity={0.9} />
          <text x={f1(r.p.x)} y={y0 + 10 + r.fila * 14} textAnchor={r.p.anchor} fontSize={11} className="fill-muted-foreground">
            {r.texto}
          </text>
        </g>
      ))}

      {anosAporte < T && (
        <g>
          <line x1={ux} x2={ux} y1={y0} y2={y1} stroke={VERMELHO} strokeWidth={1} strokeDasharray="4 3" opacity={0.7} />
          <text x={ux > 600 ? ux - 6 : ux + 6} y={y0 + 10} textAnchor={ux > 600 ? "end" : "start"} fontSize={11} className="fill-muted-foreground">
            Início do usufruto · {anoInicio + anosAporte}
          </text>
        </g>
      )}

      {preservar != null && anosAporte < T && (
        <g>
          <line x1={ux} x2={x1} y1={Y(preservar)} y2={Y(preservar)} stroke={VERDE} strokeWidth={1.5} strokeDasharray="6 4" />
          <text x={x1 - 4} y={Y(preservar) - 6} textAnchor="end" fontSize={11} fill={VERDE}>Patrimônio a preservar (pessimista)</text>
        </g>
      )}

      {visiveis.length > 1 && (
        <polyline points={visiveis.map((p) => `${f1(X(p.t))},${f1(Y(p.v))}`).join(" ")}
          fill="none" style={{ stroke: "hsl(var(--foreground))" }} strokeWidth={2.5} strokeLinejoin="round" />
      )}
      {hoje && hoje.t >= 0 && hoje.t <= T && (
        <g>
          <circle cx={X(hoje.t)} cy={Y(hoje.v)} r={5} style={{ fill: "hsl(var(--foreground))", stroke: "hsl(var(--card))" }} strokeWidth={2} />
          <text x={X(hoje.t) + 9} y={Y(hoje.v) - 8} fontSize={11} fontWeight={700} style={{ fill: "hsl(var(--foreground))" }}>Hoje</text>
        </g>
      )}

      {fimX != null && (
        <g>
          <circle cx={fimX} cy={Y(0)} r={5} fill={VERMELHO} style={{ stroke: "hsl(var(--card))" }} strokeWidth={2} />
          <text x={fimX > 620 ? fimX - 10 : fimX + 10} y={Y(0) - 10} textAnchor={fimX > 620 ? "end" : "start"} fontSize={11} fill={VERMELHO} fontWeight={600}>
            Pessimista esgota em {anoInicio + esgota + 1}
          </text>
        </g>
      )}

      {anos.map((t) => (
        <text key={t} x={X(t)} y={y1 + 20} textAnchor="middle" fontSize={11} className="fill-muted-foreground">{anoInicio + t}</text>
      ))}
    </svg>
  );
}

export function BarrasChart({ barras }: { barras: { ano: number; patrimonio: number; investido: number }[] }) {
  const W = 780, H = 300, x0 = 64, x1 = 764, y0 = 16, y1 = 262;
  if (!barras.length) return null;
  const ymax = valorMaximoBonito(Math.max(...barras.map((b) => Math.max(b.patrimonio, b.investido)), 1));
  const Y = (v: number) => y1 - (v / ymax) * (y1 - y0);
  const slot = (x1 - x0) / barras.length;
  const largura = Math.min(slot * 0.62, 70);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto block" role="img" aria-label="Investido líquido e ganho por ano">
      {Array.from({ length: 5 }, (_, i) => {
        const v = (ymax * i) / 4;
        return (
          <g key={i}>
            <line x1={x0} x2={x1} y1={Y(v)} y2={Y(v)} style={{ stroke: "hsl(var(--border))" }} strokeWidth={1} />
            <text x={x0 - 8} y={Y(v)} dy="0.35em" textAnchor="end" fontSize={11} className="fill-muted-foreground">{mil(v)}</text>
          </g>
        );
      })}
      {barras.map((b, i) => {
        const cx = x0 + slot * (i + 0.5);
        const base = Math.min(b.investido, b.patrimonio);
        const ganho = Math.max(0, b.patrimonio - b.investido);
        return (
          <g key={b.ano}>
            {/* 2 px de superfície entre os segmentos empilhados */}
            <rect x={cx - largura / 2} y={Y(base)} width={largura} height={Math.max(0, y1 - Y(base))} fill="#A3ACB6" rx={3}
              style={{ stroke: "hsl(var(--card))" }} strokeWidth={1} />
            {ganho > 0 && (
              <rect x={cx - largura / 2} y={Y(base + ganho)} width={largura} height={Math.max(0, Y(base) - Y(base + ganho))} fill={VERDE} rx={3}
                style={{ stroke: "hsl(var(--card))" }} strokeWidth={1} />
            )}
            <text x={cx} y={y1 + 20} textAnchor="middle" fontSize={11} className="fill-muted-foreground">{b.ano}</text>
          </g>
        );
      })}
    </svg>
  );
}
