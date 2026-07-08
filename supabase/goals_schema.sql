-- ============================================================
-- Metas (Goals) — tabelas e políticas RLS
-- Executar no Supabase: SQL Editor → New query → Run
-- ============================================================

-- Tabela de projetos
CREATE TABLE goals_projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'Geral',
  description TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Tabela de tarefas
CREATE TABLE goals_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES goals_projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT DEFAULT '',
  baseline_start DATE,
  baseline_end DATE,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  progress INTEGER NOT NULL DEFAULT 0 CHECK (progress >= 0 AND progress <= 100),
  depends_on TEXT[] DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS
ALTER TABLE goals_projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE goals_tasks ENABLE ROW LEVEL SECURITY;

-- Políticas de goals_projects (acesso apenas ao dono do perfil)
CREATE POLICY "goals_projects_select" ON goals_projects
  FOR SELECT USING (profile_id = auth.uid());

CREATE POLICY "goals_projects_insert" ON goals_projects
  FOR INSERT WITH CHECK (profile_id = auth.uid());

CREATE POLICY "goals_projects_update" ON goals_projects
  FOR UPDATE USING (profile_id = auth.uid());

CREATE POLICY "goals_projects_delete" ON goals_projects
  FOR DELETE USING (profile_id = auth.uid());

-- Políticas de goals_tasks (acesso via projeto do dono)
CREATE POLICY "goals_tasks_select" ON goals_tasks
  FOR SELECT USING (
    project_id IN (SELECT id FROM goals_projects WHERE profile_id = auth.uid())
  );

CREATE POLICY "goals_tasks_insert" ON goals_tasks
  FOR INSERT WITH CHECK (
    project_id IN (SELECT id FROM goals_projects WHERE profile_id = auth.uid())
  );

CREATE POLICY "goals_tasks_update" ON goals_tasks
  FOR UPDATE USING (
    project_id IN (SELECT id FROM goals_projects WHERE profile_id = auth.uid())
  );

CREATE POLICY "goals_tasks_delete" ON goals_tasks
  FOR DELETE USING (
    project_id IN (SELECT id FROM goals_projects WHERE profile_id = auth.uid())
  );
