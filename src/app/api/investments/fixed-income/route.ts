import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { fetchBcbIndicators } from "@/lib/investments/bcb";
import { fetchTesouroTitulos } from "@/lib/investments/tesouro";

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const [bcbRes, tesouroRes] = await Promise.allSettled([
    fetchBcbIndicators(),
    fetchTesouroTitulos(),
  ]);

  const indicators = bcbRes.status === "fulfilled"
    ? bcbRes.value
    : { selic: null, cdi: null, ipca12m: null, ipcaMes: null, igpm: null, poupanca: null, referenceDate: null };

  const tesouro = tesouroRes.status === "fulfilled"
    ? tesouroRes.value
    : { titulos: [], dataBase: null };

  return NextResponse.json({ indicators, tesouro });
}
