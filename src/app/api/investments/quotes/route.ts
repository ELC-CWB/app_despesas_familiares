import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const BRAPI_BASE = "https://brapi.dev/api";

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const symbols = request.nextUrl.searchParams.get("symbols");
  if (!symbols) return NextResponse.json({ error: "No symbols" }, { status: 400 });

  const token = process.env.BRAPI_TOKEN;
  const url = `${BRAPI_BASE}/quote/${encodeURIComponent(symbols)}?token=${token}&fundamental=true`;

  const res = await fetch(url, { next: { revalidate: 30 } });
  if (!res.ok) {
    return NextResponse.json({ error: "Upstream error", status: res.status }, { status: 502 });
  }

  const data = await res.json();
  return NextResponse.json(data);
}
