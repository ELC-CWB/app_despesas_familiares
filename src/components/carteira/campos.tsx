"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { PALETA, type CorPaleta } from "@/lib/carteira/constantes";
import { parseDecimal, paraTexto } from "@/lib/carteira/numeros";

// Peças de formulário da Carteira, no padrão visual do app.

export const ACCENT = "#3b82f6";
export const VERMELHO = "#B42318"; // fora da banda / erro (SPEC §4.2)

export const inputCls =
  "w-full rounded-lg border border-border bg-secondary/40 px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-blue-500/30 disabled:opacity-60 disabled:cursor-not-allowed";

export function Campo({
  label, nota, children, className,
}: {
  label: string;
  nota?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <label className={cn("block min-w-0", className)}>
      <span className="text-xs font-semibold text-muted-foreground mb-1 block">{label}</span>
      {children}
      {nota && <span className="text-[11px] text-muted-foreground mt-1 block leading-snug">{nota}</span>}
    </label>
  );
}

// Campo numérico pt-BR: aceita vírgula, guarda o texto enquanto o usuário digita
// e devolve o número (null quando vazio ou inválido).
export function DecimalInput({
  value, onValue, placeholder, disabled, className, casas = 4, ariaLabel,
}: {
  value: number | null;
  onValue: (v: number | null) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  casas?: number;
  ariaLabel?: string;
}) {
  const [texto, setTexto] = useState(() => paraTexto(value, casas));
  const [focado, setFocado] = useState(false);
  const [ultimo, setUltimo] = useState(value);

  // Sincroniza quando o valor muda por fora (ex.: "Preencher bandas pela regra 5/25")
  if (!focado && value !== ultimo) {
    setUltimo(value);
    setTexto(paraTexto(value, casas));
  }

  return (
    <input
      type="text"
      inputMode="decimal"
      aria-label={ariaLabel}
      className={cn(inputCls, "text-right tabular-nums", className)}
      value={texto}
      placeholder={placeholder}
      disabled={disabled}
      onFocus={() => setFocado(true)}
      onBlur={() => { setFocado(false); setUltimo(value); setTexto(paraTexto(value, casas)); }}
      onChange={(e) => { setTexto(e.target.value); onValue(parseDecimal(e.target.value)); }}
    />
  );
}

export function Paleta({
  valor, onEscolher, disabled,
}: {
  valor: CorPaleta;
  onEscolher: (c: CorPaleta) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Cor">
      {PALETA.map((c) => {
        const on = c.id === valor;
        return (
          <button
            key={c.id}
            type="button"
            role="radio"
            aria-checked={on}
            aria-label={c.nome}
            title={c.nome}
            disabled={disabled}
            onClick={() => onEscolher(c.id)}
            className="w-7 h-7 rounded-full transition-transform hover:scale-110 disabled:hover:scale-100"
            style={{
              backgroundColor: c.hex,
              boxShadow: on ? "0 0 0 2px hsl(var(--card)), 0 0 0 4px #1F3247" : undefined,
            }}
          />
        );
      })}
    </div>
  );
}

// Seção em cartão; recolhível quando `recolhivel` (SPEC §4.5)
export function Secao({
  titulo, descricao, recolhivel = false, abertaInicial = false, acao, children,
}: {
  titulo: string;
  descricao?: React.ReactNode;
  recolhivel?: boolean;
  abertaInicial?: boolean;
  acao?: React.ReactNode;
  children: React.ReactNode;
}) {
  const [aberta, setAberta] = useState(!recolhivel || abertaInicial);
  return (
    <section className="rounded-2xl border border-border bg-card shadow-sm">
      <div className="flex items-start justify-between gap-3 p-4 sm:p-5">
        {recolhivel ? (
          <button type="button" onClick={() => setAberta((a) => !a)} aria-expanded={aberta}
            className="flex items-start gap-2 text-left flex-1 min-w-0">
            <ChevronDown className={cn("h-4 w-4 mt-1 flex-shrink-0 text-muted-foreground transition-transform", !aberta && "-rotate-90")} />
            <CabecalhoSecao titulo={titulo} descricao={descricao} />
          </button>
        ) : (
          <div className="flex-1 min-w-0"><CabecalhoSecao titulo={titulo} descricao={descricao} /></div>
        )}
        {aberta && acao}
      </div>
      {aberta && <div className="px-4 sm:px-5 pb-4 sm:pb-5">{children}</div>}
    </section>
  );
}

function CabecalhoSecao({ titulo, descricao }: { titulo: string; descricao?: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <h2 className="text-base font-bold text-foreground" style={{ fontFamily: "Sora, sans-serif" }}>{titulo}</h2>
      {descricao && <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{descricao}</p>}
    </div>
  );
}

export function BotaoAdicionar({ children, onClick, disabled }: { children: React.ReactNode; onClick: () => void; disabled?: boolean }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled}
      className="px-3 py-1.5 rounded-lg text-xs font-bold border border-dashed transition-colors hover:bg-secondary/50 disabled:opacity-50 whitespace-nowrap"
      style={{ borderColor: ACCENT, color: ACCENT }}>
      {children}
    </button>
  );
}

// Faixa verde (ok) ou vermelha/âmbar (pendente), como a soma dos alvos do protótipo
export function Faixa({ ok, children, tom = "vermelho" }: { ok: boolean; children: React.ReactNode; tom?: "vermelho" | "ambar" }) {
  const estilo = ok
    ? { backgroundColor: "rgba(46,107,63,0.10)", color: "#2E6B3F" }
    : tom === "ambar"
      ? { backgroundColor: "rgba(138,90,0,0.10)", color: "#8A5A00" }
      : { backgroundColor: "rgba(180,35,24,0.08)", color: VERMELHO };
  return <div className="rounded-lg px-3 py-2 text-sm font-semibold" style={estilo}>{children}</div>;
}
