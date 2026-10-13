import { createClient } from "@/lib/supabase/server";
import { fmtNum } from "@/lib/carteira/numeros";

// Cotação do dólar no canto das telas da Carteira (SPEC §3): "US$ 1 = R$ 5,01".
// Última cotação salva; some se ainda não houver nenhuma.
export async function CotacaoDolar() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("mercado_cotacoes")
    .select("fechamento, data")
    .eq("ticker", "USDBRL=X")
    .order("data", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!data) return null;
  const [y, m, d] = String(data.data).split("-");
  return (
    <span title={`Cotação de ${d}/${m}/${y}`}
      className="text-xs sm:text-sm text-muted-foreground bg-secondary px-2.5 sm:px-3 py-1.5 rounded-full font-medium whitespace-nowrap tabular-nums">
      US$ 1 = R$ {fmtNum(Number(data.fechamento), 2, 2)}
    </span>
  );
}
