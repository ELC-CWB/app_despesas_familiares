import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ stocks: [] }, { status: 401 });

  const q = request.nextUrl.searchParams.get("q") ?? "";
  const token = process.env.BRAPI_TOKEN;

  // Try v2 search
  try {
    const v2url = `https://brapi.dev/api/v2/stocks?token=${token}${q ? `&search=${encodeURIComponent(q)}` : ""}&limit=20`;
    const v2res = await fetch(v2url, { cache: "no-store" });
    if (v2res.ok) {
      const data = await v2res.json();
      // v2 returns { stocks: [{ stock, name, ... }] }
      const tickers = (data.stocks ?? []).map((s: { stock?: string; symbol?: string }) => s.stock ?? s.symbol).filter(Boolean);
      if (tickers.length > 0) return NextResponse.json({ stocks: tickers });
    }
  } catch {
    // fall through to v1
  }

  // Fallback to v1 available endpoint
  try {
    const v1url = `https://brapi.dev/api/available?token=${token}${q ? `&search=${encodeURIComponent(q)}` : ""}`;
    const v1res = await fetch(v1url, { cache: "no-store" });
    if (v1res.ok) {
      const data = await v1res.json();
      return NextResponse.json({ stocks: (data.stocks ?? []).slice(0, 20) });
    }
  } catch {
    // ignore
  }

  return NextResponse.json({ stocks: [] });
}
