"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { ALIQUOTAS_PADRAO, CORRETORA_PADRAO, MODELO_EXEMPLO } from "@/lib/carteira/constantes";
import { novoId } from "@/lib/carteira/ids";
import { fmtBRL, fmtNum } from "@/lib/carteira/numeros";
import {
  alvoDoBloco, alvosFecham100, patrimonioFimAcumulacao, retiradaMaxPerpetua, somaAlvos, vereditoPerpetuidade,
} from "@/lib/carteira/regras";
import type { Ativo, Bloco, Corretora, Geografia, OnboardingEntrada, PlanoEntrada, PosicaoInicial } from "@/lib/carteira/tipos";
import { validarOnboarding } from "@/lib/carteira/validacao";
import { ACCENT, Campo, DecimalInput, VERMELHO } from "@/components/carteira/campos";
import { AtivosEditor, BlocosEditor, CorretoraEditor, GeografiasEditor, novoAtivo, tickerSugerido } from "@/components/carteira/editores";

// Primeiros passos (docs/carteira/SPEC.md §4.1): 7 etapas; grava tudo de uma vez no fim.

const ETAPAS = ["Ponto de partida", "Geografias e blocos", "Ativos e alvos", "Corretora", "Plano", "Posições atuais", "Pronto"];

const TEXTOS: [string, string][] = [
  ["Como você quer começar?", "Este app não sugere uma carteira: você define a sua estratégia. Comece do zero ou a partir de uma estrutura de exemplo, que pode ser toda editada."],
  ["Geografias e blocos", "Geografias agrupam blocos, e blocos agrupam ativos. Essa estrutura forma o gráfico da tela inicial. A cor da geografia define os tons dos seus blocos."],
  ["Ativos e alvos", "Cadastre os ativos da sua estratégia, o bloco de cada um, o percentual-alvo e a banda de tolerância. A soma dos alvos precisa fechar em 100%."],
  ["Corretora", "Onde você investe e quanto ela cobra. Esses custos entram nas estimativas de compras e vendas."],
  ["Plano", "Quanto você tem, quanto vai aportar e por quanto tempo. O app projeta um túnel entre um cenário pessimista e um otimista."],
  ["Posições atuais", "Se você já tem algum desses ativos, informe a quantidade e o preço médio. Etapa opcional."],
  ["Tudo pronto", "Confira o resumo da sua estratégia."],
];

type PlanoForm = {
  patrimonio_inicial: number | null; aporte_mensal: number | null; anos_aporte: number | null;
  anos_usufruto: number | null; retirada_pct: number | null; rent_pess_pct: number | null; rent_otim_pct: number | null;
  perpetuo: boolean;
};

type PosicaoForm = { quantidade: number | null; preco_medio: number | null; custo_total_brl: number | null };

const n = (v: number | null) => v ?? 0;

export function PrimeirosPassosClient() {
  const router = useRouter();
  const { toast } = useToast();
  const [etapa, setEtapa] = useState(0);
  const [origem, setOrigem] = useState<"branco" | "exemplo" | null>(null);
  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState(false);

  const [geografias, setGeografias] = useState<Geografia[]>([]);
  const [blocos, setBlocos] = useState<Bloco[]>([]);
  const [ativos, setAtivos] = useState<Ativo[]>([]);
  const [corretora, setCorretora] = useState<Corretora>(() => ({ id: novoId(), nome: "", mercado: "brasil", ...CORRETORA_PADRAO }));
  const [plano, setPlano] = useState<PlanoForm>({
    patrimonio_inicial: 0, aporte_mensal: 3000, anos_aporte: 20, anos_usufruto: 30,
    retirada_pct: 3.5, rent_pess_pct: 3, rent_otim_pct: 6, perpetuo: true,
  });
  const [posicoes, setPosicoes] = useState<Record<string, PosicaoForm>>({});

  const limpar = () => setErro("");

  // ── Etapa 0 ──
  const escolherOrigem = (o: "branco" | "exemplo") => {
    limpar();
    setOrigem(o);
    setAtivos([]);
    if (o === "exemplo") {
      const ids: Record<string, string> = {};
      setGeografias(MODELO_EXEMPLO.geografias.map((g, i) => {
        ids[g.chave] = novoId();
        return { id: ids[g.chave], nome: g.nome, cor: g.cor, ordem: i };
      }));
      setBlocos(MODELO_EXEMPLO.blocos.map((b, i) => ({
        id: novoId(), geografia_id: ids[b.geografia], nome: b.nome, nome_curto: null, banda_pp: null, ordem: i,
      })));
    } else {
      const g = novoId();
      setGeografias([{ id: g, nome: "", cor: "azul", ordem: 0 }]);
      setBlocos([{ id: novoId(), geografia_id: g, nome: "", nome_curto: null, banda_pp: null, ordem: 0 }]);
    }
  };

  // ── Validação por etapa (textos do protótipo) ──
  const soma = somaAlvos(ativos);
  const validar = (): string => {
    if (etapa === 0 && !origem) return "Escolha uma das opções para continuar.";
    if (etapa === 1) {
      if (!geografias.length) return "Cadastre pelo menos uma geografia.";
      if (geografias.some((g) => !g.nome.trim())) return "Dê um nome a todas as geografias.";
      if (!blocos.length) return "Cadastre pelo menos um bloco.";
      if (blocos.some((b) => !b.nome.trim())) return "Dê um nome a todos os blocos.";
      if (blocos.some((b) => !geografias.some((g) => g.id === b.geografia_id))) return "Escolha a geografia de todos os blocos.";
    }
    if (etapa === 2) {
      if (!ativos.length) return "Cadastre pelo menos um ativo.";
      if (ativos.some((a) => !a.codigo.trim())) return "Informe o código de todos os ativos.";
      const cods = ativos.map((a) => a.codigo.trim());
      const rep = cods.find((c, i) => cods.indexOf(c) !== i);
      if (rep) return `O código ${rep} aparece mais de uma vez.`;
      if (!alvosFecham100(soma)) return `A soma dos alvos precisa ser 100% (hoje está em ${fmtNum(soma, 1, 1)}%).`;
      const vazios = blocos.filter((b) => !ativos.some((a) => a.bloco_id === b.id));
      if (vazios.length) return `O bloco ${vazios.map((b) => b.nome).join(", ")} não tem ativos. Adicione ativos a ele ou volte e remova o bloco.`;
    }
    if (etapa === 3 && !corretora.nome.trim()) return "Informe o nome da corretora.";
    if (etapa === 4) {
      if (n(plano.rent_pess_pct) >= n(plano.rent_otim_pct)) return "A rentabilidade pessimista precisa ser menor que a otimista.";
      if (!(n(plano.retirada_pct) > 0)) return "A retirada anual precisa ser maior que zero.";
      if (!plano.perpetuo && !(n(plano.anos_usufruto) >= 1)) return "Informe os anos de usufruto.";
    }
    if (etapa === 5) {
      const inc = ativos.find((a) => {
        const p = posicoes[a.id];
        if (!p) return false;
        const algum = p.quantidade != null || p.preco_medio != null || p.custo_total_brl != null;
        const completo = n(p.quantidade) > 0 && n(p.preco_medio) > 0 && (a.moeda === "BRL" || n(p.custo_total_brl) > 0);
        return algum && !completo;
      });
      if (inc) return `Complete a posição de ${inc.codigo} ou deixe os campos em branco.`;
    }
    return "";
  };

  const avancar = () => {
    const msg = validar();
    if (msg) { setErro(msg); return; }
    limpar();
    if (etapa === 1 && !ativos.length && blocos.length) setAtivos([novoAtivo(blocos[0].id, corretora.id, 0)]);
    if (etapa === 2) {
      const temExt = ativos.some((a) => a.mercado === "exterior");
      const temBr = ativos.some((a) => a.mercado === "brasil");
      setCorretora((c) => ({ ...c, mercado: temExt && temBr ? "ambos" : temExt ? "exterior" : "brasil" }));
    }
    setEtapa((s) => s + 1);
  };

  const voltar = () => { limpar(); setEtapa((s) => Math.max(0, s - 1)); };

  // ── Montagem final ──
  const planoEntrada = (): PlanoEntrada => ({
    ano_inicio: new Date().getFullYear(),
    patrimonio_inicial: n(plano.patrimonio_inicial),
    aporte_mensal: n(plano.aporte_mensal),
    anos_aporte: Math.round(n(plano.anos_aporte)),
    perpetuo: plano.perpetuo,
    anos_usufruto: plano.perpetuo ? null : Math.round(n(plano.anos_usufruto)),
    retirada_pct: n(plano.retirada_pct),
    rent_pess_pct: n(plano.rent_pess_pct),
    rent_otim_pct: n(plano.rent_otim_pct),
  });

  const posicoesEntrada = (): PosicaoInicial[] => ativos.flatMap((a) => {
    const p = posicoes[a.id];
    if (!p || !(n(p.quantidade) > 0) || !(n(p.preco_medio) > 0)) return [];
    const custo = a.moeda === "BRL" ? n(p.quantidade) * n(p.preco_medio) : n(p.custo_total_brl);
    return [{ ativo_id: a.id, quantidade: n(p.quantidade), preco_medio: n(p.preco_medio), custo_total_brl: custo }];
  });

  const concluir = async () => {
    const entrada: OnboardingEntrada = {
      estrutura: {
        corretoras: [corretora],
        geografias,
        blocos,
        ativos: ativos.map((a, i) => ({
          ...a,
          codigo: a.codigo.trim().toUpperCase(),
          corretora_id: corretora.id,
          ticker_cotacao: a.ticker_cotacao ?? tickerSugerido(a.codigo, a.mercado),
          ordem: i,
        })),
        config: { colchao_ativo_id: null, colchao_min_meses: 12, aliquotas: { ...ALIQUOTAS_PADRAO } },
      },
      plano: planoEntrada(),
      posicoes: posicoesEntrada(),
    };
    const msg = validarOnboarding(entrada);
    if (msg) { setErro(msg); return; }
    setSalvando(true);
    limpar();
    try {
      const res = await fetch("/api/carteira/onboarding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(entrada),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? "Erro ao salvar");
      toast({ title: "Estratégia cadastrada", description: "Ajustes finos ficam em Configurações." });
      router.push("/investments");
      router.refresh();
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Erro ao salvar");
      setSalvando(false);
    }
  };

  // ── Prévia do plano ──
  const lo = patrimonioFimAcumulacao(n(plano.patrimonio_inicial), n(plano.aporte_mensal), n(plano.anos_aporte), n(plano.rent_pess_pct));
  const hi = patrimonioFimAcumulacao(n(plano.patrimonio_inicial), n(plano.aporte_mensal), n(plano.anos_aporte), n(plano.rent_otim_pct));
  const ret = n(plano.retirada_pct) / 100;
  const maxPess = retiradaMaxPerpetua(n(plano.rent_pess_pct));
  const veredito = vereditoPerpetuidade(n(plano.retirada_pct), n(plano.rent_pess_pct), n(plano.rent_otim_pct));
  const brl0 = (v: number) => fmtBRL(v, 0);

  const totalPosicoes = posicoesEntrada().reduce((s, p) => s + p.custo_total_brl, 0);
  const [titulo, subtitulo] = TEXTOS[etapa];

  return (
    <div className="max-w-4xl mx-auto space-y-5">
      {/* Progresso */}
      <div>
        <div className="flex gap-1.5">
          {ETAPAS.map((nome, i) => (
            <div key={nome} className="flex-1 min-w-0">
              <div className="h-1.5 rounded-full" style={{ backgroundColor: i < etapa ? "#1F3247" : i === etapa ? ACCENT : "hsl(var(--border))" }} />
              <p className={`hidden md:block text-[11px] mt-1.5 truncate ${i === etapa ? "font-bold text-foreground" : "text-muted-foreground"}`}>{nome}</p>
            </div>
          ))}
        </div>
        <p className="md:hidden text-xs text-muted-foreground mt-2">Etapa {etapa + 1} de {ETAPAS.length} · {ETAPAS[etapa]}</p>
      </div>

      <div className="rounded-2xl border border-border bg-card p-4 sm:p-6 shadow-sm space-y-5">
        <div>
          <h2 className="text-lg font-bold text-foreground" style={{ fontFamily: "Sora, sans-serif" }}>{titulo}</h2>
          <p className="text-sm text-muted-foreground mt-1 leading-relaxed">{subtitulo}</p>
        </div>

        {etapa === 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3" role="radiogroup">
            {([
              ["branco", "Começar em branco", "Você cria geografias, blocos e ativos do zero."],
              ["exemplo", "Usar modelo de exemplo", "Estrutura pronta com Global e Brasil e quatro blocos genéricos (Ações globais, Alternativos, Ações Brasil e Renda fixa), sem ativos. Tudo editável."],
            ] as const).map(([id, t, txt]) => {
              const on = origem === id;
              return (
                <button key={id} type="button" role="radio" aria-checked={on} onClick={() => escolherOrigem(id)}
                  className="text-left rounded-xl border-2 p-4 transition-colors hover:bg-secondary/30"
                  style={{ borderColor: on ? ACCENT : "hsl(var(--border))", backgroundColor: on ? `${ACCENT}0d` : undefined }}>
                  <p className="text-sm font-bold text-foreground flex items-center gap-2">
                    {on && <Check className="h-4 w-4" style={{ color: ACCENT }} />}{t}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{txt}</p>
                </button>
              );
            })}
          </div>
        )}

        {etapa === 1 && (
          <div className="space-y-5">
            <GeografiasEditor geografias={geografias} blocos={blocos} ativos={ativos} onChange={(g) => { limpar(); setGeografias(g); }} />
            <BlocosEditor compacto blocos={blocos} geografias={geografias} ativos={ativos} onChange={(b) => { limpar(); setBlocos(b); }} />
          </div>
        )}

        {etapa === 2 && (
          <AtivosEditor compacto ativos={ativos} blocos={blocos} corretoras={[corretora]}
            onChange={(a) => { limpar(); setAtivos(a); }} />
        )}

        {etapa === 3 && <CorretoraEditor corretora={corretora} onChange={(c) => { limpar(); setCorretora(c); }} />}

        {etapa === 4 && (
          <div className="space-y-5">
            <div className="inline-flex rounded-lg bg-secondary/50 p-1" role="radiogroup">
              {([["Perpétuo", true], ["Com prazo", false]] as const).map(([rot, v]) => (
                <button key={rot} type="button" role="radio" aria-checked={plano.perpetuo === v}
                  onClick={() => setPlano((p) => ({ ...p, perpetuo: v }))}
                  className="px-4 py-1.5 rounded-md text-sm font-semibold transition-colors"
                  style={plano.perpetuo === v ? { backgroundColor: "hsl(var(--card))", color: "hsl(var(--foreground))", boxShadow: "0 1px 2px rgba(0,0,0,0.08)" } : { color: "hsl(var(--muted-foreground))" }}>
                  {rot}
                </button>
              ))}
            </div>
            <p className="text-xs text-muted-foreground -mt-3">
              {plano.perpetuo
                ? "A carteira deve durar para sempre: a retirada não pode consumir o patrimônio."
                : "A carteira pode ser consumida até o fim do prazo definido."}
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {([
                ["patrimonio_inicial", "Patrimônio inicial (R$)", "Quanto você já tem investido nesta estratégia", 2],
                ["aporte_mensal", "Aporte mensal (R$)", "Valor que pretende investir por mês", 2],
                ["anos_aporte", "Anos de aporte", "Duração da fase de acumulação", 0],
                ...(plano.perpetuo ? [] : [["anos_usufruto", "Anos de usufruto", "Por quanto tempo a carteira deve durar", 0] as const]),
                ["retirada_pct", "Retirada anual no usufruto (%)", "Sobre o patrimônio no início do usufruto, corrigida pela inflação", 2],
                ["rent_pess_pct", "Rentabilidade real pessimista (% a.a.)", "Acima da inflação", 2],
                ["rent_otim_pct", "Rentabilidade real otimista (% a.a.)", "Acima da inflação", 2],
              ] as const).map(([k, rot, nota, casas]) => (
                <Campo key={k} label={rot} nota={nota}>
                  <DecimalInput value={plano[k]} casas={casas} ariaLabel={rot}
                    onValue={(v) => { limpar(); setPlano((p) => ({ ...p, [k]: v })); }} />
                </Campo>
              ))}
            </div>
            <div className="rounded-xl bg-secondary/40 p-4 space-y-2">
              <p className="text-xs font-bold text-muted-foreground uppercase tracking-wide">Prévia</p>
              <Linha k="Início do usufruto" v={String(new Date().getFullYear() + Math.round(n(plano.anos_aporte)))} />
              <Linha k="Patrimônio no início do usufruto" v={`${brl0(lo)} a ${brl0(hi)}`} />
              <Linha k="Retirada mensal estimada" v={`${brl0((lo * ret) / 12)} a ${brl0((hi * ret) / 12)}`} />
              {plano.perpetuo && (
                <p className="text-sm font-semibold pt-1" style={{ color: veredito === "verde" ? "#2E6B3F" : veredito === "amarelo" ? "#8A5A00" : VERMELHO }}>
                  {veredito === "verde" && "Perpétua mesmo no cenário pessimista"}
                  {veredito === "amarelo" && "Perpétua só no cenário otimista"}
                  {veredito === "vermelho" && "Não é perpétua"}
                  {veredito !== "verde" && (
                    <span className="block text-xs font-medium mt-0.5">
                      Retirada máxima perpétua no pessimista: {fmtNum(maxPess, 1, 2)}% a.a. ({brl0((lo * maxPess) / 100 / 12)}/mês)
                    </span>
                  )}
                </p>
              )}
            </div>
          </div>
        )}

        {etapa === 5 && (
          <div className="space-y-2">
            {ativos.map((a) => {
              const p = posicoes[a.id] ?? { quantidade: null, preco_medio: null, custo_total_brl: null };
              const setP = (patch: Partial<PosicaoForm>) => { limpar(); setPosicoes((x) => ({ ...x, [a.id]: { ...p, ...patch } })); };
              const total = a.moeda === "BRL" ? n(p.quantidade) * n(p.preco_medio) : n(p.custo_total_brl);
              return (
                <div key={a.id} className="rounded-xl border border-border p-3 grid grid-cols-2 sm:grid-cols-4 gap-3 items-end">
                  <p className="col-span-2 sm:col-span-1 text-sm font-bold text-foreground self-center">{a.codigo || "—"}</p>
                  <Campo label="Quantidade">
                    <DecimalInput value={p.quantidade} casas={8} ariaLabel={`Quantidade de ${a.codigo}`} onValue={(v) => setP({ quantidade: v })} />
                  </Campo>
                  <Campo label={`Preço médio (${a.moeda})`}>
                    <DecimalInput value={p.preco_medio} casas={6} ariaLabel={`Preço médio de ${a.codigo}`} onValue={(v) => setP({ preco_medio: v })} />
                  </Campo>
                  {a.moeda === "BRL" ? (
                    <div>
                      <span className="text-xs font-semibold text-muted-foreground mb-1 block">Total</span>
                      <p className="text-sm font-semibold text-foreground py-2 tabular-nums">{total ? fmtBRL(total) : "—"}</p>
                    </div>
                  ) : (
                    <Campo label="Custo total (R$)" nota="Quanto saiu da sua conta em reais">
                      <DecimalInput value={p.custo_total_brl} casas={2} ariaLabel={`Custo total em reais de ${a.codigo}`} onValue={(v) => setP({ custo_total_brl: v })} />
                    </Campo>
                  )}
                </div>
              );
            })}
            <p className="text-sm font-semibold text-foreground text-right pt-1">Total informado: {fmtBRL(totalPosicoes)}</p>
          </div>
        )}

        {etapa === 6 && (
          <div className="space-y-2">
            <Linha k="Geografias" v={geografias.map((g) => g.nome).join(", ") || "—"} />
            <Linha k="Blocos" v={blocos.map((b) => `${b.nome} ${fmtNum(alvoDoBloco(b.id, ativos), 1, 1)}%`).join(" · ") || "—"} />
            <Linha k="Ativos" v={`${ativos.length} ${ativos.length === 1 ? "ativo" : "ativos"}: ${ativos.map((a) => a.codigo).join(", ")}`} />
            <Linha k="Corretora" v={corretora.nome || "—"} />
            <Linha k="Plano" v={`${brl0(n(plano.aporte_mensal))}/mês por ${Math.round(n(plano.anos_aporte))} anos · retirada de ${fmtNum(n(plano.retirada_pct), 1, 1)}% a.a. · ${plano.perpetuo ? "usufruto perpétuo" : `usufruto de ${Math.round(n(plano.anos_usufruto))} anos`}`} />
            <Linha k="Posições informadas" v={totalPosicoes ? fmtBRL(totalPosicoes) : "nenhuma (registrar depois em Movimentações)"} />
          </div>
        )}

        {erro && <p className="text-sm font-medium" style={{ color: VERMELHO }}>{erro}</p>}

        <div className="flex items-center justify-between gap-2 pt-2 border-t border-border">
          <button type="button" onClick={voltar} disabled={salvando}
            className="px-4 py-2 rounded-lg text-sm font-semibold border border-border hover:bg-secondary/50 transition-colors"
            style={{ visibility: etapa > 0 ? "visible" : "hidden" }}>
            Voltar
          </button>
          <div className="flex items-center gap-2">
            {etapa === 5 && (
              <button type="button" onClick={() => { setPosicoes({}); limpar(); setEtapa(6); }}
                className="px-4 py-2 rounded-lg text-sm font-semibold text-muted-foreground hover:bg-secondary/50 transition-colors">
                Pular
              </button>
            )}
            {etapa < 6 ? (
              <button type="button" onClick={avancar}
                className="px-5 py-2 rounded-lg text-sm font-semibold text-white" style={{ backgroundColor: ACCENT }}>
                {etapa === 5 ? "Continuar" : "Avançar"}
              </button>
            ) : (
              <button type="button" onClick={concluir} disabled={salvando}
                className="px-5 py-2 rounded-lg text-sm font-semibold text-white flex items-center gap-2 disabled:opacity-60"
                style={{ backgroundColor: ACCENT }}>
                {salvando && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                Concluir
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function Linha({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-baseline gap-0.5 sm:gap-3 text-sm">
      <span className="text-muted-foreground sm:w-56 flex-shrink-0">{k}</span>
      <span className="font-semibold text-foreground tabular-nums">{v}</span>
    </div>
  );
}
