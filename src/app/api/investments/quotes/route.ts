import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const BRAPI_BASE = "https://brapi.dev/api";

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const raw = request.nextUrl.searchParams.get("symbols") ?? "";
  if (!raw) return NextResponse.json({ error: "No symbols" }, { status: 400 });

  // Sanitize: keep only alphanumeric, commas, dots and dashes (valid ticker chars)
  const symbols = raw.replace(/[^A-Z0-9,.\-]/gi, "");

  const token = process.env.BRAPI_TOKEN;
  // Do NOT encode symbols — brapi expects literal commas in the path
  const url = `${BRAPI_BASE}/quote/${symbols}?token=${token}&fundamental=true`;

  try {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      return NextResponse.json({ error: "Upstream error", detail: body }, { status: 502 });
    }
    const data = await res.json();
    return NextResponse.json(data);
  } catch (err) {
    return NextResponse.json({ error: "Network error", detail: String(err) }, { status: 503 });
  }
}
