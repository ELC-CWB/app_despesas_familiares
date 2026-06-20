import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ stocks: [] }, { status: 401 });

  const q = request.nextUrl.searchParams.get("q") ?? "";
  const token = process.env.BRAPI_TOKEN;
  const url = `https://brapi.dev/api/available?token=${token}${q ? `&search=${encodeURIComponent(q)}` : ""}`;

  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) return NextResponse.json({ stocks: [] });

  const data = await res.json();
  return NextResponse.json(data);
}
