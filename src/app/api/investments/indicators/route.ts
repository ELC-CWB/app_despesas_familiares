import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const BRAPI_BASE = "https://brapi.dev/api";
const BOLSAI_BASE = "https://api.usebolsai.com/api/v1";

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const symbol = (request.nextUrl.searchParams.get("symbol") ?? "").replace(/[^A-Z0-9.\-]/gi, "");
  if (!symbol) return NextResponse.json({ error: "No symbol" }, { status: 400 });

  const brapiToken = process.env.BRAPI_TOKEN!;
  const bolsaiKey = process.env.BOLSAI_API_KEY!;

  // Fetch bolsai (fundamentals) + brapi (real-time price + logo) in parallel
  const [bolsaiRes, brapiRes] = await Promise.allSettled([
    fetch(`${BOLSAI_BASE}/fundamentals/${symbol}`, {
      headers: { "X-API-Key": bolsaiKey },
      cache: "no-store",
    }),
    fetch(`${BRAPI_BASE}/quote/${symbol}?token=${brapiToken}`, {
      cache: "no-store",
    }),
  ]);

  // Parse bolsai — primary source
  let bolsai: Record<string, unknown> | null = null;
  let bolsaiError: string | null = null;
  if (bolsaiRes.status === "fulfilled") {
    if (bolsaiRes.value.ok) {
      try { bolsai = await bolsaiRes.value.json(); }
      catch { bolsaiError = "Erro ao parsear resposta bolsai"; }
    } else {
      const body = await bolsaiRes.value.text().catch(() => "");
      bolsaiError = `bolsai HTTP ${bolsaiRes.value.status}: ${body.slice(0, 200)}`;
    }
  } else {
    bolsaiError = "Erro de rede (bolsai)";
  }

  // Parse brapi — real-time price + logo only
  let price: number | null = null;
  let change: number | null = null;
  let changePct: number | null = null;
  let logourl: string | null = null;
  let shortName: string | null = null;
  if (brapiRes.status === "fulfilled" && brapiRes.value.ok) {
    try {
      const data = await brapiRes.value.json();
      const r = (data.results ?? [])[0];
      if (r) {
        price = r.regularMarketPrice ?? null;
        change = r.regularMarketChange ?? null;
        changePct = r.regularMarketChangePercent ?? null;
        logourl = r.logourl ?? null;
        shortName = r.shortName ?? null;
      }
    } catch { /* ignore brapi parse error */ }
  }

  if (!bolsai) {
    return NextResponse.json({ error: bolsaiError ?? "Sem dados" }, { status: 502 });
  }

  return NextResponse.json({
    bolsai,
    price,
    change,
    changePct,
    logourl,
    shortName,
  });
}
