-- MedExam Generator: Database Migration
-- Run this in Supabase SQL Editor (Dashboard > SQL Editor > New Query)

-- Projects table: stores all project data as JSONB
CREATE TABLE IF NOT EXISTS projects (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  data JSONB NOT NULL DEFAULT '{}',
  last_modified TIMESTAMPTZ DEFAULT NOW()
);

-- Enable Row Level Security so users can only access their own data
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view own projects" ON projects
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own projects" ON projects
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own projects" ON projects
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own projects" ON projects
  FOR DELETE USING (auth.uid() = user_id);

-- Question reports: a learner marks a question for review, with an optional
-- comment. Kept outside the projects JSONB so reports never enter the sync merge.
CREATE TABLE IF NOT EXISTS question_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  project_id TEXT NOT NULL,
  item_id TEXT NOT NULL,
  exam_id TEXT,
  exam_title TEXT,
  attempt_id TEXT,
  question_id INTEGER,
  where_reported TEXT NOT NULL CHECK (where_reported IN ('results', 'progress')),
  selected_option TEXT,
  comment TEXT NOT NULL DEFAULT '' CHECK (char_length(comment) <= 2000),
  question_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'resolved', 'dismissed')),
  resolution_note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, project_id, item_id)
);

ALTER TABLE question_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own question reports" ON question_reports
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "Users can add own question reports" ON question_reports
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own question reports" ON question_reports
  FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own question reports" ON question_reports
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

REVOKE ALL ON question_reports FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON question_reports TO authenticated;
