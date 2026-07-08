"use client";

import React, {
  useState, useEffect, useCallback, useMemo, useRef, useLayoutEffect,
} from "react";
import {
  Plus, Calendar, Trash2, ArrowLeft, X, Diamond, ChevronRight, CircleAlert,
  Check, Pencil, Link2, TriangleAlert, AlignLeft, Loader2,
} from "lucide-react";

/* ================================================================== */
/*  Tipos                                                              */
/* ================================================================== */
type Task = {
  id: string;
  name: string;
  description: string;
  baselineStart: string;
  baselineEnd: string;
  start: string;
  end: string;
  progress: number;
  dependsOn: string[];
};

type Project = {
  id: string;
  name: string;
  category: string;
  description: string;
  tasks: Task[];
};

/* ================================================================== */
/*  Constantes                                                         */
/* ================================================================== */
const CELEBRACOES = [
  "Tarefa concluída — anote o que destravou a entrega.",
  "Etapa fechada. Avise quem depende dela.",
  "Um passo a menos. Respire e siga para a próxima barra.",
  "Feito. Reveja o cronograma com calma antes de seguir.",
];

const CAT_PALETTE = [
  { bg: "#EAEDF4", fg: "#5E6E8E" },
  { bg: "#E9F1EB", fg: "#5E876A" },
  { bg: "#F3EAE2", fg: "#9A6E48" },
  { bg: "#EFE9F2", fg: "#7E6A93" },
  { bg: "#F4EEDD", fg: "#9C8A46" },
  { bg: "#E6EEF0", fg: "#4E7C87" },
];

/* ================================================================== */
/*  Utilitários                                                        */
/* ================================================================== */
function catColor(cat: string): { bg: string; fg: string } {
  let h = 0;
  for (let i = 0; i < cat.length; i++) h = ((h * 31) + cat.charCodeAt(i)) >>> 0;
  return CAT_PALETTE[h % CAT_PALETTE.length];
}

function uid(): string { return Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-3); }
function today(): string { return new Date().toISOString().slice(0, 10); }
function shift(n: number): string { const d = new Date(); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); }
function days(a: string, b: string): number {
  if (!a || !b) return 0;
  return Math.round((new Date(b + "T00:00:00").getTime() - new Date(a + "T00:00:00").getTime()) / 86400000);
}
function fmt(iso: string): string {
  if (!iso) return "—";
  const [, m, d] = iso.split("-");
  return `${d}/${m}`;
}
function fmtFull(iso: string): string {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y.slice(2)}`;
}
function addDaysIso(iso: string, n: number): string {
  const d = new Date(iso + "T00:00:00");
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}
function clamp(v: number, a: number, b: number): number { return Math.min(b, Math.max(a, v)); }

/* ================================================================== */
/*  Lógica de negócio                                                  */
/* ================================================================== */
function effectiveEnd(t: Task, ref = today()): string {
  if ((t.progress || 0) >= 100) return t.end;
  return ref > t.end ? ref : t.end;
}
function baselineDelay(t: Task, ref = today()): number {
  return days(t.baselineEnd, effectiveEnd(t, ref));
}
function taskState(t: Task, ref = today()): "done" | "late" | "future" | "active" {
  if ((t.progress || 0) >= 100) return "done";
  if (days(t.end, ref) > 0) return "late";
  if (days(ref, t.start) > 0) return "future";
  return "active";
}
function projProgress(p: Project): number {
  if (!p.tasks.length) return 0;
  let w = 0, acc = 0;
  p.tasks.forEach((t) => { const dur = Math.max(1, days(t.start, t.end)); w += dur; acc += dur * (t.progress || 0); });
  return Math.round(acc / w);
}
function projRange(p: Project): { min: string; max: string } {
  const ds = p.tasks.flatMap((t) => [t.start, t.end, t.baselineStart, t.baselineEnd]).filter(Boolean);
  if (!ds.length) return { min: today(), max: today() };
  return { min: ds.reduce((a, b) => (a < b ? a : b)), max: ds.reduce((a, b) => (a > b ? a : b)) };
}
function lateCount(p: Project): number {
  return p.tasks.filter((t) => (t.progress || 0) < 100 && days(t.end, today()) > 0).length;
}
function depViolation(t: Task, all: Task[]): boolean {
  return (t.dependsOn || []).some((pid) => {
    const pred = all.find((x) => x.id === pid);
    return pred && days(pred.end, t.start) < 0;
  });
}

/* ================================================================== */
/*  Constantes do Gantt                                                */
/* ================================================================== */
const ROW_H = 48, HEAD_H = 34;
const MIN_PPD = 5, MAX_PPD = 34;
const NAME_W_DEFAULT = 190, NAME_W_MIN = 120, NAME_W_MAX = 460;

/* ================================================================== */
/*  Componente principal                                               */
/* ================================================================== */
export function GoalsClient() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => { loadProjects(); }, []);

  async function loadProjects() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/goals/projects");
      if (!res.ok) throw new Error("Erro ao carregar projetos");
      setProjects(await res.json());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro desconhecido");
    } finally {
      setLoading(false);
    }
  }

  const celebrate = useCallback(() => {
    setToast(CELEBRACOES[(Math.random() * CELEBRACOES.length) | 0]);
    setTimeout(() => setToast(null), 5000);
  }, []);

  const addProject = async (p: { name: string; category: string; description: string }) => {
    try {
      const res = await fetch("/api/goals/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(p),
      });
      if (!res.ok) throw new Error("Erro ao criar projeto");
      const proj: Project = await res.json();
      setProjects((prev) => [...prev, proj]);
      setShowNew(false);
    } catch (e) { console.error(e); }
  };

  const deleteProject = async (id: string) => {
    try {
      await fetch(`/api/goals/projects/${id}`, { method: "DELETE" });
      setProjects((prev) => prev.filter((p) => p.id !== id));
      setSelected(null);
    } catch (e) { console.error(e); }
  };

  const handleProjectUpdate = (updated: Project) => {
    setProjects((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
  };

  const knownCategories = useMemo(
    () => [...new Set(projects.map((p) => p.category).filter(Boolean))],
    [projects],
  );

  if (loading) {
    return (
      <div className="cume center">
        <style>{CSS}</style>
        <Loader2 size={28} style={{ color: "#5E6E8E", animation: "spin 1s linear infinite" }} />
        <style>{`@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}`}</style>
      </div>
    );
  }

  if (error) {
    return (
      <div className="cume center">
        <style>{CSS}</style>
        <span className="muted">{error}</span>
      </div>
    );
  }

  const sel = projects.find((p) => p.id === selected);

  return (
    <div className="cume">
      <style>{CSS}</style>

      {toast && (
        <div className="toast">
          <span className="toast-ic"><Check size={15} /></span>
          <div><b>Tarefa concluída</b><p>{toast}</p></div>
        </div>
      )}

      <div className={"wrap" + (sel ? " wide" : "")}>
        {!sel ? (
          <>
            <header className="head">
              <div>
                <h1 className="h1">Metas</h1>
                <p className="tag">Cronograma dos seus projetos.</p>
              </div>
              <button className="fab" onClick={() => setShowNew(true)} aria-label="Novo projeto">
                <Plus size={20} />
              </button>
            </header>

            <div className="plist">
              {projects.map((p) => {
                const pr = projProgress(p), r = projRange(p), lc = lateCount(p), c = catColor(p.category || "Geral");
                return (
                  <button key={p.id} className="pcard" onClick={() => setSelected(p.id)}>
                    <div className="pcard-top">
                      <span className="chip" style={{ background: c.bg, color: c.fg }}>{p.category || "Geral"}</span>
                      {lc > 0 && <span className="latepill"><CircleAlert size={12} /> {lc} atrasada{lc > 1 ? "s" : ""}</span>}
                    </div>
                    <h3 className="pcard-name">{p.name}</h3>
                    <p className="pcard-dates"><Calendar size={13} /> {fmtFull(r.min)} — {fmtFull(r.max)} · {p.tasks.length} tarefas</p>
                    <div className="mini-bar"><div className="mini-fill" style={{ width: pr + "%" }} /></div>
                    <div className="pcard-foot"><span>{pr}% concluído</span><ChevronRight size={16} /></div>
                  </button>
                );
              })}
              <button className="padd" onClick={() => setShowNew(true)}><Plus size={18} /> Novo projeto</button>
            </div>
          </>
        ) : (
          <ProjectView
            project={sel}
            onBack={() => setSelected(null)}
            onProjectUpdate={handleProjectUpdate}
            onDelete={() => deleteProject(sel.id)}
            knownCategories={knownCategories}
            celebrate={celebrate}
          />
        )}
      </div>

      {showNew && (
        <ProjectModal onClose={() => setShowNew(false)} onSave={addProject} knownCategories={knownCategories} />
      )}
    </div>
  );
}

/* ================================================================== */
/*  ProjectView                                                        */
/* ================================================================== */
interface ProjectViewProps {
  project: Project;
  onBack: () => void;
  onProjectUpdate: (p: Project) => void;
  onDelete: () => void;
  knownCategories: string[];
  celebrate: () => void;
}

function ProjectView({ project, onBack, onProjectUpdate, onDelete, knownCategories, celebrate }: ProjectViewProps) {
  const [editing, setEditing] = useState<Task | null>(null);
  const [adding, setAdding] = useState(false);
  const [editingProject, setEditingProject] = useState(false);
  const [showBaselines, setShowBaselines] = useState(true);
  const [showDesc, setShowDesc] = useState(!!project.description);
  const [editingDesc, setEditingDesc] = useState(false);
  const [descDraft, setDescDraft] = useState(project.description ?? "");
  const pr = projProgress(project);
  const lc = lateCount(project);
  const c = catColor(project.category || "Geral");

  const saveTask = async (task: Task) => {
    const isNew = !project.tasks.find((t) => t.id === task.id);
    const was = project.tasks.find((t) => t.id === task.id);
    const becameDone = !!was && (was.progress || 0) < 100 && (task.progress || 0) >= 100;

    try {
      let saved: Task;
      if (isNew) {
        const res = await fetch("/api/goals/tasks", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...task, projectId: project.id }),
        });
        if (!res.ok) throw new Error("Erro ao salvar tarefa");
        saved = await res.json();
      } else {
        const res = await fetch(`/api/goals/tasks/${task.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(task),
        });
        if (!res.ok) throw new Error("Erro ao salvar tarefa");
        saved = await res.json();
      }

      const sort = (arr: Task[]) => [...arr].sort((a, b) => (a.start || "").localeCompare(b.start || ""));
      const tasks = isNew
        ? sort([...project.tasks, saved])
        : sort(project.tasks.map((t) => (t.id === task.id ? saved : t)));

      onProjectUpdate({ ...project, tasks });
      if (becameDone) celebrate();
    } catch (e) { console.error(e); }

    setEditing(null);
    setAdding(false);
  };

  const delTask = async (id: string) => {
    setEditing(null);
    const affectedTasks = project.tasks.filter((t) => (t.dependsOn || []).includes(id));
    const tasks = project.tasks
      .filter((t) => t.id !== id)
      .map((t) => ({ ...t, dependsOn: (t.dependsOn || []).filter((d) => d !== id) }));
    onProjectUpdate({ ...project, tasks });

    try {
      await fetch(`/api/goals/tasks/${id}`, { method: "DELETE" });
      for (const t of affectedTasks) {
        await fetch(`/api/goals/tasks/${t.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...t, dependsOn: (t.dependsOn || []).filter((d) => d !== id) }),
        }).catch(() => {});
      }
    } catch (e) { console.error(e); }
  };

  const saveProject = async (patch: { name: string; category: string; description: string }) => {
    try {
      await fetch(`/api/goals/projects/${project.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      onProjectUpdate({ ...project, ...patch });
      setEditingProject(false);
    } catch (e) { console.error(e); }
  };

  const saveDesc = async (desc: string) => {
    try {
      await fetch(`/api/goals/projects/${project.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: project.name, category: project.category, description: desc }),
      });
      onProjectUpdate({ ...project, description: desc });
      setEditingDesc(false);
    } catch (e) { console.error(e); }
  };

  return (
    <div>
      <div className="dnav">
        <button className="ghost" onClick={onBack}><ArrowLeft size={18} /> Projetos</button>
        <button className="ghost danger" onClick={onDelete}><Trash2 size={16} /></button>
      </div>

      <div className="dtitle-row">
        <div>
          <span className="chip" style={{ background: c.bg, color: c.fg }}>{project.category || "Geral"}</span>
          <h2 className="dtitle">{project.name}</h2>
        </div>
        <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
          <button
            className="ghost"
            title="Descrição do projeto"
            style={project.description ? { color: "var(--accent)" } : undefined}
            onClick={() => { setShowDesc(!showDesc); if (!showDesc) setEditingDesc(false); }}
          >
            <AlignLeft size={15} />
          </button>
          <button className="ghost" onClick={() => setEditingProject(true)}><Pencil size={15} /> Editar</button>
        </div>
      </div>

      {showDesc && (
        <div className="desc-panel">
          {editingDesc ? (
            <>
              <textarea
                className="in ta"
                value={descDraft}
                onChange={e => setDescDraft(e.target.value)}
                placeholder="Descreva o objetivo, escopo ou contexto deste projeto..."
                rows={3}
                autoFocus
              />
              <div className="desc-actions">
                <button className="btn" style={{ fontSize: 13, padding: "8px 14px" }} onClick={() => saveDesc(descDraft)}>Salvar</button>
                <button className="ghost" onClick={() => { setEditingDesc(false); setDescDraft(project.description ?? ""); }}>Cancelar</button>
              </div>
            </>
          ) : (
            <div className="desc-view">
              <p className="desc-text" style={!project.description ? { color: "#B7B5AD" } : undefined}>
                {project.description || "Sem descrição. Clique em editar para adicionar."}
              </p>
              <button className="ghost" title="Editar descrição" onClick={() => setEditingDesc(true)}><Pencil size={13} /></button>
            </div>
          )}
        </div>
      )}

      <div className="dmeta">
        <span>{pr}% concluído</span>
        {lc > 0
          ? <span className="dlate"><CircleAlert size={13} /> {lc} tarefa{lc > 1 ? "s" : ""} atrasada{lc > 1 ? "s" : ""}</span>
          : <span className="dok"><Check size={13} /> no prazo</span>}
      </div>
      <div className="dbar"><div className="dbar-fill" style={{ width: pr + "%" }} /></div>

      <Gantt project={project} onPick={(t) => setEditing(t)} showBaselines={showBaselines} />

      <div className="ttools">
        <button className="btn" onClick={() => setAdding(true)}><Plus size={16} /> Adicionar tarefa</button>
        <label className="chk-toggle">
          <input type="checkbox" checked={showBaselines} onChange={(e) => setShowBaselines(e.target.checked)} />
          Mostrar linha de base
        </label>
        <span className="legend">
          <i className="lg done" /> concluída &nbsp;
          <i className="lg active" /> em andamento &nbsp;
          <i className="lg late" /> atrasada &nbsp;
          <i className="lg future" /> a fazer &nbsp;
          <i className="lg baseline" /> planejado (linha de base)
        </span>
      </div>

      {editing && (
        <TaskModal
          task={editing}
          allTasks={project.tasks}
          onSave={saveTask}
          onDelete={() => delTask(editing.id)}
          onClose={() => setEditing(null)}
        />
      )}
      {adding && (
        <TaskModal allTasks={project.tasks} onSave={saveTask} onClose={() => setAdding(false)} />
      )}
      {editingProject && (
        <ProjectModal
          initial={project}
          onClose={() => setEditingProject(false)}
          onSave={saveProject}
          knownCategories={knownCategories}
          isEdit
        />
      )}
    </div>
  );
}

/* ================================================================== */
/*  Gantt                                                              */
/* ================================================================== */
interface GanttProps {
  project: Project;
  onPick: (t: Task) => void;
  showBaselines: boolean;
}

function Gantt({ project, onPick, showBaselines }: GanttProps) {
  const tasks = project.tasks;
  const wrapRef = useRef<HTMLDivElement>(null);
  const [containerW, setContainerW] = useState(900);
  const [nameW, setNameW] = useState(NAME_W_DEFAULT);
  const dragRef = useRef<{ startX: number; startW: number } | null>(null);
  const storageKey = `goals:nameW:${project.id}`;

  useLayoutEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const measure = () => setContainerW(el.clientWidth);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    window.addEventListener("resize", measure);
    return () => { ro.disconnect(); window.removeEventListener("resize", measure); };
  }, []);

  // Carrega largura salva ao abrir o projeto
  useEffect(() => {
    const saved = localStorage.getItem(storageKey);
    if (saved) setNameW(clamp(Number(saved), NAME_W_MIN, NAME_W_MAX));
  }, [storageKey]);

  const updateNameW = (w: number) => {
    const clamped = clamp(w, NAME_W_MIN, NAME_W_MAX);
    setNameW(clamped);
    localStorage.setItem(storageKey, String(clamped));
  };

  const onResizerDown = (e: React.PointerEvent) => {
    e.preventDefault();
    dragRef.current = { startX: e.clientX, startW: nameW };
    const onMove = (ev: PointerEvent) => {
      if (!dragRef.current) return;
      updateNameW(dragRef.current.startW + ev.clientX - dragRef.current.startX);
    };
    const onUp = () => {
      dragRef.current = null;
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };

  const layout = useMemo(() => {
    if (!tasks.length) return null;
    const all = tasks.flatMap((t) => [t.start, t.end, t.baselineStart, t.baselineEnd]).concat([today()]).filter(Boolean);
    let t0 = all.reduce((a, b) => (a < b ? a : b));
    let t1 = all.reduce((a, b) => (a > b ? a : b));
    t0 = addDaysIso(t0, -3); t1 = addDaysIso(t1, 4);
    const total = Math.max(1, days(t0, t1));
    const available = Math.max(200, containerW - nameW - 2);
    const ppd = clamp(available / total, MIN_PPD, MAX_PPD);
    const chartW = total * ppd;
    let step = Math.max(1, Math.round(66 / ppd));
    const niceSteps = [1, 2, 3, 5, 7, 14, 21, 30];
    step = niceSteps.reduce((best, s) => (Math.abs(s - step) < Math.abs(best - step) ? s : best), niceSteps[0]);
    const ticks: { x: number; label: string }[] = [];
    for (let d = 0; d <= total; d += step) ticks.push({ x: d * ppd, label: fmt(addDaysIso(t0, d)) });
    const x = (iso: string) => days(t0, iso) * ppd;
    return { chartW, ticks, x, todayX: x(today()) };
  }, [tasks, containerW, nameW]);

  if (!layout) {
    return <div className="gantt-empty">Sem tarefas ainda. Adicione a primeira para montar o cronograma.</div>;
  }

  const { chartW, ticks, x, todayX } = layout;
  const totalH = tasks.length * ROW_H;

  return (
    <div className="gantt-scroll" ref={wrapRef}>
      <div className="gantt-inner" style={{ width: nameW + chartW }}>
        <div className="col-resizer-wrap" style={{ left: nameW - 3, height: 0 }}>
          <div className="col-resizer" style={{ height: HEAD_H + totalH }} onPointerDown={onResizerDown} title="Arraste para redimensionar" />
        </div>

        {ticks.map((t, i) => (
          <div key={"g" + i} className="vgrid" style={{ left: nameW + t.x, top: HEAD_H, height: totalH }} />
        ))}
        {todayX >= 0 && todayX <= chartW && (
          <div className="today-line" style={{ left: nameW + todayX, top: HEAD_H - 6, height: totalH + 6 }}>
            <span className="today-lbl">hoje</span>
          </div>
        )}

        <div className="g-head" style={{ height: HEAD_H }}>
          <div className="g-head-name" style={{ width: nameW }}>Tarefa</div>
          <div className="g-head-time" style={{ width: chartW }}>
            {ticks.map((t, i) => <span key={i} className="tick" style={{ left: t.x }}>{t.label}</span>)}
          </div>
        </div>

        {tasks.map((t) => {
          const st = taskState(t);
          const isMs = t.start === t.end;
          const isMsBaseline = t.baselineStart === t.baselineEnd;
          const xs = x(t.start), xe = x(t.end);
          const bxs = x(t.baselineStart), bxe = x(t.baselineEnd);
          const w = Math.max(isMs ? 0 : 6, xe - xs);
          const bw = Math.max(isMsBaseline ? 0 : 6, bxe - bxs);
          const fillW = (w * (t.progress || 0)) / 100;
          const dl = baselineDelay(t);
          const dxEnd = xe, dxToday = x(effectiveEnd(t));
          const violation = depViolation(t, tasks);
          const hasDesc = !!t.description && t.description.trim().length > 0;

          return (
            <div key={t.id} className="g-row" style={{ height: ROW_H }} onClick={() => onPick(t)}>
              <div className="g-name" style={{ width: nameW }} title={hasDesc ? t.description : undefined}>
                <span className={"g-name-t " + (st === "late" ? "is-late" : "")}>
                  {violation && <TriangleAlert size={12} className="warn-ic" />}
                  <span className="g-name-txt">{t.name}</span>
                  {hasDesc && <AlignLeft size={11} className="desc-ic" />}
                </span>
                <span className="g-name-d">
                  {fmt(t.start)}–{fmt(t.end)} · {t.progress || 0}%
                  {dl !== 0 && (
                    <em className={dl > 0 ? "dl-late" : "dl-early"}>
                      {dl > 0 ? ` +${dl}d` : ` ${-dl}d adiant.`}
                    </em>
                  )}
                </span>
              </div>
              <div className="g-track" style={{ width: chartW, height: ROW_H }}>
                {showBaselines && t.baselineStart && t.baselineEnd && (
                  isMsBaseline
                    ? <div className="ms-baseline" style={{ left: bxs - 6 }} title="Planejado" />
                    : <div className="bar-baseline" style={{ left: bxs, width: bw }} title="Planejado" />
                )}
                {isMs ? (
                  <div
                    className={"ms " + (st === "late" ? "late" : t.progress >= 100 ? "done" : "future")}
                    style={{ left: xs - 8 }} title={t.name}
                  />
                ) : (
                  <>
                    <div className={"bar " + st} style={{ left: xs, width: w }} title={t.name}>
                      <div className="bar-fill" style={{ width: fillW }} />
                    </div>
                    {dl > 0 && (
                      <>
                        <div className="bar-delay" style={{ left: dxEnd, width: Math.max(4, dxToday - dxEnd) }} />
                        <span className="delay-lbl" style={{ left: dxToday + 6 }}>+{dl}d</span>
                      </>
                    )}
                  </>
                )}
              </div>
            </div>
          );
        })}

        <DependencyArrows tasks={tasks} x={x} chartW={chartW} totalH={totalH} nameW={nameW} headH={HEAD_H} rowH={ROW_H} />
      </div>
    </div>
  );
}

/* ================================================================== */
/*  DependencyArrows                                                   */
/* ================================================================== */
interface DependencyArrowsProps {
  tasks: Task[];
  x: (iso: string) => number;
  chartW: number;
  totalH: number;
  nameW: number;
  headH: number;
  rowH: number;
}

function DependencyArrows({ tasks, x, chartW, totalH, nameW, headH, rowH }: DependencyArrowsProps) {
  const idx: Record<string, number> = {};
  tasks.forEach((t, i) => (idx[t.id] = i));
  const arrows: { key: string; xFrom: number; yFrom: number; xTo: number; yTo: number; bad: boolean }[] = [];
  tasks.forEach((t, i) => {
    (t.dependsOn || []).forEach((pid) => {
      const pi = idx[pid];
      if (pi == null) return;
      const pred = tasks[pi];
      arrows.push({
        key: pid + "-" + t.id,
        xFrom: x(pred.end),
        yFrom: headH + pi * rowH + rowH / 2,
        xTo: x(t.start),
        yTo: headH + i * rowH + rowH / 2,
        bad: x(t.start) < x(pred.end),
      });
    });
  });
  if (!arrows.length) return null;
  return (
    <svg className="dep-svg" style={{ left: nameW, top: 0, width: chartW, height: headH + totalH }}>
      <defs>
        <marker id="arrowOk" markerWidth="7" markerHeight="7" refX="5.5" refY="3.5" orient="auto">
          <path d="M0,0 L7,3.5 L0,7 Z" fill="#8B93A0" />
        </marker>
        <marker id="arrowBad" markerWidth="7" markerHeight="7" refX="5.5" refY="3.5" orient="auto">
          <path d="M0,0 L7,3.5 L0,7 Z" fill="#C0463D" />
        </marker>
      </defs>
      {arrows.map((a) => {
        const midX = a.bad ? a.xFrom + 14 : a.xFrom + 10;
        const d = `M ${a.xFrom} ${a.yFrom} L ${midX} ${a.yFrom} L ${midX} ${a.yTo} L ${a.xTo - 6} ${a.yTo}`;
        return (
          <path
            key={a.key} d={d} fill="none"
            stroke={a.bad ? "#C0463D" : "#B7BCC6"}
            strokeWidth={a.bad ? 1.6 : 1.4}
            strokeDasharray={a.bad ? "3 2" : undefined}
            markerEnd={`url(#${a.bad ? "arrowBad" : "arrowOk"})`}
          />
        );
      })}
    </svg>
  );
}

/* ================================================================== */
/*  TaskModal                                                          */
/* ================================================================== */
interface TaskModalProps {
  task?: Task;
  allTasks?: Task[];
  onSave: (t: Task) => void;
  onDelete?: () => void;
  onClose: () => void;
}

function TaskModal({ task, allTasks = [], onSave, onDelete, onClose }: TaskModalProps) {
  const isNew = !task;
  const [name, setName] = useState(task?.name || "");
  const [description, setDescription] = useState(task?.description || "");
  const [baselineStart, setBaselineStart] = useState(task?.baselineStart || task?.start || today());
  const [baselineEnd, setBaselineEnd] = useState(task?.baselineEnd || task?.end || shift(7));
  // Para nova tarefa, real = baseline por padrão; usuário pode personalizar
  const [start, setStart] = useState(task?.start || today());
  const [end, setEnd] = useState(task?.end || shift(7));
  const [progress, setProgress] = useState<number>(task?.progress ?? 0);
  const [milestone, setMilestone] = useState(task ? task.start === task.end : false);
  const [dependsOn, setDependsOn] = useState<string[]>(task?.dependsOn || []);
  // Nova tarefa: datas reais ficam ocultas (sincronizadas com baseline)
  const [customReal, setCustomReal] = useState(!isNew);

  const candidates = allTasks.filter((t) => t.id !== task?.id);
  const toggleDep = (id: string) =>
    setDependsOn((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));

  // Ao alterar baseline em nova tarefa, sincroniza datas reais automaticamente
  const handleBaselineStart = (val: string) => {
    setBaselineStart(val);
    if (!customReal) setStart(val);
  };
  const handleBaselineEnd = (val: string) => {
    setBaselineEnd(val);
    if (!customReal) setEnd(val);
  };

  const save = () => {
    if (!name.trim()) return;
    const e = milestone ? start : (end < start ? start : end);
    const be = milestone ? baselineStart : (baselineEnd < baselineStart ? baselineStart : baselineEnd);
    // Para nova tarefa sem personalização real, garante sincronismo final
    const s = (!customReal && isNew) ? baselineStart : start;
    const ef = (!customReal && isNew) ? be : e;
    onSave({
      id: task?.id || uid(),
      name: name.trim(),
      description: description.trim(),
      start: s, end: ef,
      baselineStart, baselineEnd: be,
      progress: Number(progress),
      dependsOn,
    });
  };

  return (
    <div className="ov" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-h">
          <h3>{isNew ? "Nova tarefa" : "Editar tarefa"}</h3>
          <button className="ghost" onClick={onClose}><X size={18} /></button>
        </div>

        <label className="lab">Nome</label>
        <input className="in" autoFocus placeholder="Ex.: Instalação dos equipamentos" value={name} onChange={(e) => setName(e.target.value)} />

        <label className="lab">Descrição</label>
        <textarea className="in ta" rows={3} placeholder="Detalhes, responsável, observações…" value={description} onChange={(e) => setDescription(e.target.value)} />

        <label className="chkline">
          <input type="checkbox" checked={milestone} onChange={(e) => setMilestone(e.target.checked)} />
          <Diamond size={14} /> É um marco (data única)
        </label>

        {isNew ? (
          /* ── Nova tarefa: baseline é a entrada principal ── */
          <>
            <label className="lab">Datas planejadas (linha de base)</label>
            <div className="row2">
              <div><span className="sublab">Início</span><input type="date" className="in" value={baselineStart} onChange={(e) => handleBaselineStart(e.target.value)} /></div>
              {!milestone && <div><span className="sublab">Término</span><input type="date" className="in" value={baselineEnd} onChange={(e) => handleBaselineEnd(e.target.value)} /></div>}
            </div>

            <button className="linklike" onClick={() => {
              if (!customReal) {
                // ao abrir, inicializa real com os valores atuais do baseline
                setStart(baselineStart);
                setEnd(baselineEnd);
              }
              setCustomReal((v) => !v);
            }}>
              {customReal ? "Remover datas reais personalizadas" : "Personalizar datas reais (se diferente do planejado)"}
            </button>
            {customReal && (
              <div className="baseline-box">
                <div className="row2">
                  <div><span className="sublab">Início real</span><input type="date" className="in" value={start} onChange={(e) => setStart(e.target.value)} /></div>
                  {!milestone && <div><span className="sublab">Término real</span><input type="date" className="in" value={end} onChange={(e) => setEnd(e.target.value)} /></div>}
                </div>
              </div>
            )}
          </>
        ) : (
          /* ── Editar tarefa: real é a entrada principal ── */
          <>
            <label className="lab">Real / atual</label>
            <div className="row2">
              <div><span className="sublab">Início</span><input type="date" className="in" value={start} onChange={(e) => setStart(e.target.value)} /></div>
              {!milestone && <div><span className="sublab">Término</span><input type="date" className="in" value={end} onChange={(e) => setEnd(e.target.value)} /></div>}
            </div>

            <button className="linklike" onClick={() => setCustomReal((v) => !v)}>
              {customReal ? "Ocultar linha de base" : "Ajustar linha de base (planejado original)"}
            </button>
            {customReal && (
              <div className="baseline-box">
                <div className="row2">
                  <div><span className="sublab">Início planejado</span><input type="date" className="in" value={baselineStart} onChange={(e) => setBaselineStart(e.target.value)} /></div>
                  {!milestone && <div><span className="sublab">Término planejado</span><input type="date" className="in" value={baselineEnd} onChange={(e) => setBaselineEnd(e.target.value)} /></div>}
                </div>
                <p className="hint">A linha de base é o compromisso original. Ela não muda quando você reagenda a tarefa — assim dá para comparar planejado × real.</p>
              </div>
            )}
          </>
        )}

        <label className="lab">Progresso · {progress}%</label>
        <input type="range" min="0" max="100" step="5" value={progress} onChange={(e) => setProgress(Number(e.target.value))} className="range" />

        {candidates.length > 0 && (
          <>
            <label className="lab"><Link2 size={12} style={{ verticalAlign: "-2px" }} /> Depende de (predecessoras)</label>
            <div className="deplist">
              {candidates.map((c) => (
                <label key={c.id} className="depitem">
                  <input type="checkbox" checked={dependsOn.includes(c.id)} onChange={() => toggleDep(c.id)} />
                  <span>{c.name}</span><span className="depitem-date">até {fmt(c.end)}</span>
                </label>
              ))}
            </div>
          </>
        )}

        <div className="modal-actions">
          {!isNew && onDelete && (
            <button className="ghost danger" onClick={onDelete}><Trash2 size={15} /> Excluir</button>
          )}
          <button className="btn" style={{ marginLeft: "auto" }} onClick={save}>{isNew ? "Adicionar" : "Salvar"}</button>
        </div>
      </div>
    </div>
  );
}

/* ================================================================== */
/*  ProjectModal                                                       */
/* ================================================================== */
interface ProjectModalProps {
  initial?: { name: string; category: string; description?: string };
  onClose: () => void;
  onSave: (p: { name: string; category: string; description: string }) => void;
  knownCategories?: string[];
  isEdit?: boolean;
}

function ProjectModal({ initial, onClose, onSave, knownCategories = [], isEdit }: ProjectModalProps) {
  const [name, setName] = useState(initial?.name || "");
  const [cat, setCat] = useState(initial?.category || "");
  const [desc, setDesc] = useState(initial?.description || "");

  const save = () => {
    if (!name.trim()) return;
    onSave({ name: name.trim(), category: cat.trim() || "Geral", description: desc.trim() });
  };

  return (
    <div className="ov" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-h">
          <h3>{isEdit ? "Editar projeto" : "Novo projeto"}</h3>
          <button className="ghost" onClick={onClose}><X size={18} /></button>
        </div>
        <label className="lab">Nome do projeto</label>
        <input className="in" autoFocus placeholder="Ex.: Abertura da nova unidade" value={name} onChange={(e) => setName(e.target.value)} />
        <label className="lab">Categoria</label>
        <input className="in" list="cume-categories" placeholder="Ex.: Profissional, Pessoal, Financeiro…" value={cat} onChange={(e) => setCat(e.target.value)} />
        <datalist id="cume-categories">
          {knownCategories.map((c) => <option key={c} value={c} />)}
        </datalist>
        {knownCategories.length > 0 && (
          <div className="catchips">
            {knownCategories.map((c) => {
              const cc = catColor(c);
              return (
                <button key={c} className="catchip" style={{ background: cc.bg, color: cc.fg }} onClick={() => setCat(c)}>
                  {c}
                </button>
              );
            })}
          </div>
        )}
        <label className="lab">Descrição <span style={{ textTransform: "none", fontWeight: 400, fontSize: 11 }}>(opcional)</span></label>
        <textarea className="in ta" placeholder="Objetivo, escopo ou contexto deste projeto…" value={desc} onChange={(e) => setDesc(e.target.value)} rows={3} />
        <button className="btn full" onClick={save}>{isEdit ? "Salvar alterações" : "Criar projeto"}</button>
        {!isEdit && <p className="note">Depois de criar, abra o projeto para adicionar as tarefas ao cronograma.</p>}
      </div>
    </div>
  );
}

/* ================================================================== */
/*  CSS (preservado integralmente do app original)                     */
/* ================================================================== */
const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;600;700&family=Plus+Jakarta+Sans:wght@400;500;600;700&display=swap');
.cume{
  --bg:#F5F4F1; --panel:#FFFFFF; --line:#E7E4DE; --grid:#EEEBE4;
  --txt:#3B3E44; --mut:#93938C; --accent:#5E6E8E;
  --fill:#4D6690; --done:#4C9468; --late:#C0463D; --future:#B57C56;
  --track-active:#DCE3EE; --track-done:#D7EADB; --track-late:#F3D9D6; --track-future:#F0E2D8;
  --baseline:#AEB4BE; --today:#C79A55;
  min-height:100vh; background:var(--bg); color:var(--txt);
  font-family:'Plus Jakarta Sans',system-ui,sans-serif; -webkit-font-smoothing:antialiased;
}
.cume *{ box-sizing:border-box; }
.cume.center{ display:flex; align-items:center; justify-content:center; }
.cume button{ cursor:pointer; font-family:inherit; }
.cume button:focus-visible{ outline:2px solid var(--accent); outline-offset:2px; }
.muted{ color:var(--mut); }
.wrap{ max-width:1180px; margin:0 auto; padding:26px 22px 60px; transition:max-width .15s; }
.wrap.wide{ max-width:1640px; }

.head{ display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:22px; }
.h1{ font-family:'Space Grotesk'; font-size:34px; font-weight:700; margin:0; letter-spacing:-.5px; color:#2E3138; }
.tag{ color:var(--mut); font-size:14px; margin:4px 0 0; }
.fab{ background:var(--accent); border:none; color:#fff; width:44px; height:44px; border-radius:13px; display:grid; place-items:center; box-shadow:0 4px 14px rgba(94,110,142,.28); transition:transform .15s; }
.fab:hover{ transform:translateY(-2px); }

.plist{ display:flex; flex-direction:column; gap:12px; max-width:760px; }
.pcard{ text-align:left; background:var(--panel); border:1px solid var(--line); border-radius:16px; padding:16px 18px; color:var(--txt); display:flex; flex-direction:column; gap:9px; transition:transform .15s,box-shadow .2s,border-color .2s; }
.pcard:hover{ transform:translateY(-2px); box-shadow:0 8px 22px rgba(60,60,60,.06); border-color:#D8D4CC; }
.pcard-top{ display:flex; justify-content:space-between; align-items:center; }
.pcard-name{ font-size:17px; font-weight:600; margin:0; color:#33363C; }
.pcard-dates{ color:var(--mut); font-size:12.5px; margin:0; display:inline-flex; align-items:center; gap:6px; }
.pcard-foot{ display:flex; justify-content:space-between; align-items:center; font-size:12.5px; color:var(--mut); font-weight:500; }
.pcard-foot svg{ color:#C2C2BA; }

.chip{ display:inline-flex; align-items:center; gap:5px; font-size:11px; font-weight:600; padding:4px 9px; border-radius:20px; width:fit-content; }
.latepill{ display:inline-flex; align-items:center; gap:4px; font-size:11px; font-weight:600; color:var(--late); background:#F7E7E6; padding:4px 9px; border-radius:20px; }

.mini-bar{ height:8px; background:#EDEBE5; border-radius:20px; overflow:hidden; }
.mini-fill{ height:100%; border-radius:20px; background:linear-gradient(90deg,#7688AC,var(--fill)); transition:width .8s cubic-bezier(.4,1,.4,1); }
.padd{ border:1.5px dashed var(--line); background:transparent; border-radius:14px; color:var(--mut); padding:14px; display:flex; align-items:center; justify-content:center; gap:8px; font-weight:500; transition:.2s; }
.padd:hover{ border-color:var(--accent); color:var(--accent); }

.dnav{ display:flex; justify-content:space-between; margin-bottom:12px; }
.ghost{ background:transparent; border:none; color:var(--mut); display:inline-flex; align-items:center; gap:6px; font-size:14px; padding:6px 8px; border-radius:9px; transition:.15s; }
.ghost:hover{ color:var(--txt); background:#EDEBE5; }
.ghost.danger:hover{ color:var(--late); }
.dtitle-row{ display:flex; align-items:flex-start; justify-content:space-between; gap:12px; }
.dtitle{ font-family:'Space Grotesk'; font-size:24px; font-weight:600; margin:8px 0 6px; color:#2E3138; }
.dmeta{ display:flex; gap:14px; align-items:center; font-size:13px; color:var(--mut); margin-bottom:10px; }
.dlate{ color:var(--late); display:inline-flex; align-items:center; gap:5px; font-weight:600; }
.dok{ color:#5E876A; display:inline-flex; align-items:center; gap:5px; font-weight:600; }
.dbar{ height:10px; background:#EDEBE5; border-radius:20px; overflow:hidden; margin-bottom:20px; }
.dbar-fill{ height:100%; border-radius:20px; background:linear-gradient(90deg,#7688AC,var(--fill)); transition:width .8s cubic-bezier(.4,1,.4,1); }

.gantt-scroll{ overflow-x:auto; border:1px solid var(--line); border-radius:14px; background:var(--panel); width:100%; }
.gantt-inner{ position:relative; }
.col-resizer-wrap{ position:sticky; z-index:6; }
.col-resizer{ position:absolute; top:0; width:9px; margin-left:-4px; cursor:col-resize; background:transparent; }
.col-resizer::before{ content:''; position:absolute; left:4px; top:0; width:1px; height:100%; background:var(--line); }
.col-resizer:hover::before, .col-resizer:active::before{ background:var(--accent); width:2px; left:3.5px; }
.vgrid{ position:absolute; width:1px; background:var(--grid); z-index:0; }
.today-line{ position:absolute; width:2px; background:var(--today); z-index:1; }
.today-lbl{ position:absolute; top:-2px; left:50%; transform:translateX(-50%); font-size:9px; font-weight:700; color:#fff; background:var(--today); padding:1px 5px; border-radius:6px; white-space:nowrap; }
.g-head{ display:flex; border-bottom:1px solid var(--line); position:relative; z-index:2; }
.g-head-name{ flex-shrink:0; position:sticky; left:0; background:var(--panel); display:flex; align-items:center; padding:0 12px; font-size:11px; font-weight:700; text-transform:uppercase; letter-spacing:.05em; color:var(--mut); z-index:3; border-right:1px solid var(--line); }
.g-head-time{ position:relative; }
.tick{ position:absolute; top:10px; font-size:10.5px; color:var(--mut); transform:translateX(-50%); white-space:nowrap; }
.g-row{ display:flex; border-bottom:1px solid #F1EFE9; cursor:pointer; position:relative; z-index:2; }
.g-row:hover{ background:#FAF9F6; }
.g-row:last-child{ border-bottom:none; }
.g-name{ flex-shrink:0; position:sticky; left:0; background:var(--panel); display:flex; flex-direction:column; justify-content:center; gap:2px; padding:0 12px; border-right:1px solid var(--line); z-index:3; overflow:hidden; }
.g-row:hover .g-name{ background:#FAF9F6; }
.g-name-t{ font-size:13px; font-weight:600; display:flex; align-items:center; gap:4px; min-width:0; }
.g-name-txt{ white-space:nowrap; overflow:hidden; text-overflow:ellipsis; min-width:0; }
.g-name-t.is-late{ color:var(--late); }
.warn-ic{ color:var(--late); flex-shrink:0; }
.desc-ic{ color:#ABAFA6; flex-shrink:0; }
.g-name-d{ font-size:10.5px; color:var(--mut); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.dl-late{ color:var(--late); font-weight:700; font-style:normal; }
.dl-early{ color:var(--done); font-weight:700; font-style:normal; }
.g-track{ position:relative; flex-shrink:0; }
.bar{ position:absolute; top:58%; transform:translateY(-50%); height:21px; border-radius:6px; overflow:hidden; box-shadow:0 1px 2px rgba(0,0,0,.08); z-index:2; }
.bar.active{ background:var(--track-active); }
.bar.active .bar-fill{ background:var(--fill); }
.bar.done{ background:var(--track-done); }
.bar.done .bar-fill{ background:var(--done); }
.bar.late{ background:var(--track-late); box-shadow:0 1px 2px rgba(0,0,0,.08), inset 0 0 0 1px rgba(192,70,61,.35); }
.bar.late .bar-fill{ background:var(--late); }
.bar.future{ background:var(--track-future); }
.bar.future .bar-fill{ background:var(--future); }
.bar-fill{ height:100%; border-radius:6px 0 0 6px; transition:width .6s ease; }
.bar-delay{ position:absolute; top:58%; transform:translateY(-50%); height:21px; border-radius:0 6px 6px 0; background:repeating-linear-gradient(45deg,var(--late),var(--late) 5px,#A83A32 5px,#A83A32 10px); opacity:.92; z-index:2; }
.delay-lbl{ position:absolute; top:58%; transform:translateY(-50%); font-size:11px; font-weight:700; color:var(--late); white-space:nowrap; z-index:2; }
.ms{ position:absolute; top:58%; transform:translateY(-50%) rotate(45deg); width:16px; height:16px; border-radius:3px; background:var(--accent); box-shadow:0 1px 2px rgba(0,0,0,.12); z-index:2; }
.ms.done{ background:var(--done); } .ms.late{ background:var(--late); } .ms.future{ background:var(--future); }
.bar-baseline{ position:absolute; bottom:5px; height:6px; border-radius:4px; background:var(--baseline); opacity:.9; z-index:1; }
.ms-baseline{ position:absolute; bottom:4px; transform:rotate(45deg); width:10px; height:10px; border:2px solid var(--baseline); background:transparent; z-index:1; }
.dep-svg{ position:absolute; z-index:1; pointer-events:none; overflow:visible; }
.gantt-empty{ background:var(--panel); border:1px solid var(--line); border-radius:14px; padding:28px; text-align:center; color:var(--mut); font-size:13.5px; }

.ttools{ display:flex; align-items:center; gap:16px; margin-top:16px; flex-wrap:wrap; }
.chk-toggle{ display:inline-flex; align-items:center; gap:7px; font-size:12.5px; color:var(--txt); font-weight:500; cursor:pointer; }
.chk-toggle input{ width:15px; height:15px; accent-color:var(--accent); }
.legend{ font-size:11.5px; color:var(--mut); display:inline-flex; align-items:center; flex-wrap:wrap; }
.lg{ width:14px; height:10px; border-radius:3px; display:inline-block; margin:0 5px 0 3px; vertical-align:middle; }
.lg.done{ background:var(--done); } .lg.active{ background:var(--fill); } .lg.late{ background:var(--late); } .lg.future{ background:var(--future); }
.lg.baseline{ background:var(--baseline); height:6px; }

.btn{ background:var(--accent); border:none; color:#fff; font-weight:600; font-size:14px; padding:11px 17px; border-radius:12px; display:inline-flex; align-items:center; gap:7px; transition:transform .15s; }
.btn:hover{ transform:translateY(-1px); }
.btn.full{ width:100%; justify-content:center; margin-top:18px; }

.ov{ position:fixed; inset:0; background:rgba(50,48,44,.32); backdrop-filter:blur(3px); z-index:70; display:flex; align-items:center; justify-content:center; padding:18px; animation:fade .18s; }
.sheet{ background:var(--panel); border:1px solid var(--line); border-radius:20px; padding:22px; width:100%; max-width:460px; max-height:88vh; overflow-y:auto; box-shadow:0 20px 50px rgba(40,40,40,.18); animation:pop .25s cubic-bezier(.34,1.4,.4,1); }
.sheet-h{ display:flex; justify-content:space-between; align-items:center; margin-bottom:4px; }
.sheet-h h3{ font-family:'Space Grotesk'; font-size:19px; margin:0; color:#2E3138; }
.lab{ display:block; font-size:11.5px; color:var(--mut); font-weight:600; margin:15px 0 6px; text-transform:uppercase; letter-spacing:.05em; }
.sublab{ display:block; font-size:11px; color:var(--mut); margin-bottom:5px; }
.in{ width:100%; background:#FAF9F6; border:1px solid var(--line); border-radius:11px; padding:11px 13px; color:var(--txt); font-size:14px; font-family:inherit; }
.in:focus{ outline:none; border-color:var(--accent); background:#fff; }
.in::placeholder{ color:#B7B5AD; }
.in.ta{ resize:vertical; min-height:64px; line-height:1.45; }
.row2{ display:grid; grid-template-columns:1fr 1fr; gap:12px; }
.chkline{ display:flex; align-items:center; gap:8px; font-size:13.5px; color:var(--txt); margin-top:14px; cursor:pointer; font-weight:500; }
.chkline input{ width:17px; height:17px; accent-color:var(--accent); }
.chkline svg{ color:var(--accent); }
.range{ width:100%; accent-color:var(--accent); height:6px; }
.linklike{ background:none; border:none; color:var(--accent); font-size:12.5px; font-weight:600; padding:10px 0 2px; text-decoration:underline; text-underline-offset:2px; }
.baseline-box{ background:#FAF9F6; border:1px solid var(--line); border-radius:12px; padding:12px; margin-top:8px; }
.hint{ font-size:11.5px; color:var(--mut); margin:10px 0 0; line-height:1.5; }
.deplist{ display:flex; flex-direction:column; gap:6px; max-height:150px; overflow-y:auto; border:1px solid var(--line); border-radius:11px; padding:8px 10px; background:#FAF9F6; }
.depitem{ display:flex; align-items:center; gap:8px; font-size:13px; padding:4px 0; cursor:pointer; }
.depitem input{ width:15px; height:15px; accent-color:var(--accent); }
.depitem span:nth-child(2){ flex:1; }
.depitem-date{ font-size:11px; color:var(--mut); }
.catchips{ display:flex; flex-wrap:wrap; gap:6px; margin-top:8px; }
.catchip{ border:none; font-size:11.5px; font-weight:600; padding:5px 11px; border-radius:20px; }
.modal-actions{ display:flex; align-items:center; margin-top:22px; }
.note{ font-size:12px; color:var(--mut); margin:14px 0 0; text-align:center; }

.desc-panel{ background:#FAF9F6; border:1px solid var(--line); border-radius:12px; padding:12px 14px; margin:8px 0 12px; }
.desc-view{ display:flex; gap:10px; align-items:flex-start; }
.desc-text{ flex:1; font-size:13.5px; color:var(--txt); margin:0; line-height:1.6; white-space:pre-wrap; }
.desc-actions{ display:flex; align-items:center; gap:8px; margin-top:10px; }

.toast{ position:fixed; bottom:20px; left:50%; transform:translateX(-50%); z-index:80; background:#33363C; color:#fff; padding:12px 16px; border-radius:14px; display:flex; align-items:center; gap:11px; box-shadow:0 10px 30px rgba(0,0,0,.22); max-width:calc(100% - 32px); animation:up .3s cubic-bezier(.34,1.4,.4,1); }
.toast-ic{ width:26px; height:26px; border-radius:8px; background:var(--done); display:grid; place-items:center; flex-shrink:0; }
.toast b{ font-size:13px; } .toast p{ font-size:12.5px; margin:2px 0 0; color:#D7D6D2; }

@keyframes pop{ from{ opacity:0; transform:scale(.94) translateY(8px);} to{ opacity:1; transform:none; } }
@keyframes fade{ from{ opacity:0;} to{ opacity:1; } }
@keyframes up{ from{ opacity:0; transform:translate(-50%,14px);} to{ opacity:1; transform:translate(-50%,0);} }

@media (max-width:700px){ .h1{ font-size:30px; } .row2{ grid-template-columns:1fr; } .wrap{ padding:20px 14px 50px; } }
`;
