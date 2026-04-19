-- ============================================================
-- Haashir — Supabase Migration (legacy — current app uses MongoDB, see docs/design-doc.md)
-- Run this via the setup script: bun run db:setup
-- ============================================================

-- 1. Enable pgvector
CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA extensions;

-- 2. Create incidents table
CREATE TABLE IF NOT EXISTS incidents (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title         text NOT NULL,
  type          text NOT NULL DEFAULT '',
  status        text NOT NULL DEFAULT 'active',
  priority      text NOT NULL DEFAULT 'LOW',
  initial_priority text NOT NULL DEFAULT 'LOW',
  location      text NOT NULL DEFAULT '',
  coordinates   jsonb DEFAULT '{"lat": 0, "lng": 0}',
  description   text NOT NULL DEFAULT '',
  ai_report     text NOT NULL DEFAULT '',
  confidence    float NOT NULL DEFAULT 0.0,
  caller_count  int NOT NULL DEFAULT 0,
  casualties    int NOT NULL DEFAULT 0,
  risk_index    text NOT NULL DEFAULT '',
  units_assigned text[] DEFAULT '{}',
  icon          text NOT NULL DEFAULT 'emergency',
  aggregated_details jsonb DEFAULT '[]',
  conflicts     jsonb DEFAULT '[]',
  confidence_levels  jsonb DEFAULT '[]',
  raw_logs      jsonb DEFAULT '[]',
  embedding     vector(768),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

-- 3. Add initial_priority if table already exists
ALTER TABLE incidents ADD COLUMN IF NOT EXISTS initial_priority text NOT NULL DEFAULT 'LOW';

-- 3. Alter column if table already exists with wrong dimensions
ALTER TABLE incidents ALTER COLUMN embedding TYPE vector(768)
  USING embedding::text::vector(768);

-- 4. Create index for vector similarity search
DROP INDEX IF EXISTS incidents_embedding_idx;
CREATE INDEX incidents_embedding_idx
  ON incidents
  USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);

-- 5. Create the match_incidents RPC function
CREATE OR REPLACE FUNCTION match_incidents (
  query_embedding vector(768),
  match_threshold float DEFAULT 0.6,
  match_count int DEFAULT 3
)
RETURNS TABLE (
  id uuid,
  title text,
  type text,
  status text,
  priority text,
  location text,
  description text,
  similarity float
)
LANGUAGE sql STABLE
AS $$
  SELECT
    incidents.id,
    incidents.title,
    incidents.type,
    incidents.status,
    incidents.priority,
    incidents.location,
    incidents.description,
    1 - (incidents.embedding <=> query_embedding) AS similarity
  FROM incidents
  WHERE incidents.embedding IS NOT NULL
    AND 1 - (incidents.embedding <=> query_embedding) > match_threshold
  ORDER BY incidents.embedding <=> query_embedding ASC
  LIMIT match_count;
$$;

-- 5. Auto-update updated_at on row changes
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS incidents_updated_at ON incidents;
CREATE TRIGGER incidents_updated_at
  BEFORE UPDATE ON incidents
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- 6. Enable Row Level Security (permissive for MVP)
ALTER TABLE incidents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all operations for anon" ON incidents;
CREATE POLICY "Allow all operations for anon"
  ON incidents
  FOR ALL
  USING (true)
  WITH CHECK (true);
