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

export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { projectId, name, description, baselineStart, baselineEnd, start, end, progress, dependsOn } = body;

  const { data, error } = await supabase
    .from("goals_tasks")
    .insert({
      project_id: projectId,
      name,
      description: description ?? "",
      baseline_start: baselineStart || null,
      baseline_end: baselineEnd || null,
      start_date: start,
      end_date: end,
      progress: progress ?? 0,
      depends_on: dependsOn ?? [],
    })
    .select("id, name, description, baseline_start, baseline_end, start_date, end_date, progress, depends_on")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json(mapTask(data as Record<string, unknown>), { status: 201 });
}
