import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

function mapTask(t: Record<string, unknown>) {
  return {
    id: t.id,
    name: t.name,
    description: t.description ?? "",
    baselineStart: t.baseline_start ?? "",
    baselineEnd: t.baseline_end ?? "",
    start: t.start_date,
    end: t.end_date,
    progress: t.progress ?? 0,
    dependsOn: t.depends_on ?? [],
  };
}

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: projects, error: pe } = await supabase
    .from("goals_projects")
    .select("id, name, category")
    .order("created_at");

  if (pe) return NextResponse.json({ error: pe.message }, { status: 500 });

  const { data: tasks, error: te } = await supabase
    .from("goals_tasks")
    .select("id, project_id, name, description, baseline_start, baseline_end, start_date, end_date, progress, depends_on")
    .order("start_date");

  if (te) return NextResponse.json({ error: te.message }, { status: 500 });

  const result = (projects ?? []).map((p) => ({
    id: p.id,
    name: p.name,
    category: p.category,
    tasks: (tasks ?? [])
      .filter((t) => t.project_id === p.id)
      .map(mapTask),
  }));

  return NextResponse.json(result);
}

export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { name, category } = body;

  const { data, error } = await supabase
    .from("goals_projects")
    .insert({ profile_id: user.id, name, category: category || "Geral" })
    .select("id, name, category")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ...data, tasks: [] }, { status: 201 });
}
