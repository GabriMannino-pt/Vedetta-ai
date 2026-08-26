-- ─────────────────────────────────────────────────────────────
-- GROWTH STUDIO SALES HUB — SUPABASE POSTGRESQL SCHEMA
-- Esegui questo script nell'editor SQL di Supabase (1 Click)
-- ─────────────────────────────────────────────────────────────

-- 1. Tabella PROSPECTS
CREATE TABLE IF NOT EXISTS prospects (
  id BIGSERIAL PRIMARY KEY,
  mode VARCHAR(50) NOT NULL DEFAULT 'danceflow',
  name TEXT NOT NULL,
  city TEXT,
  website TEXT NOT NULL UNIQUE,
  email TEXT,
  phone TEXT,
  classification VARCHAR(20) DEFAULT 'TIER_B',
  opportunity_score INTEGER DEFAULT 0,
  fit_score INTEGER DEFAULT 0,
  commercial_readiness INTEGER DEFAULT 0,
  status VARCHAR(50) DEFAULT 'NEW',
  evidences JSONB DEFAULT '[]'::jsonb,
  raw_data JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Tabella OUTREACH_MESSAGES
CREATE TABLE IF NOT EXISTS outreach_messages (
  id BIGSERIAL PRIMARY KEY,
  prospect_id BIGINT REFERENCES prospects(id) ON DELETE CASCADE,
  channel VARCHAR(30) NOT NULL DEFAULT 'email',
  stage VARCHAR(50) NOT NULL DEFAULT 'FIRST_CONTACT',
  subject TEXT,
  content TEXT NOT NULL,
  quality_score INTEGER DEFAULT 0,
  status VARCHAR(50) NOT NULL DEFAULT 'READY_FOR_APPROVAL',
  evidence_ids JSONB DEFAULT '[]'::jsonb,
  claims JSONB DEFAULT '[]'::jsonb,
  quality_details JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  approved_at TIMESTAMPTZ,
  sent_at TIMESTAMPTZ,
  replied_at TIMESTAMPTZ,
  reply_classification JSONB
);

-- 3. Tabella DEALS
CREATE TABLE IF NOT EXISTS deals (
  id BIGSERIAL PRIMARY KEY,
  prospect_id BIGINT REFERENCES prospects(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  mode VARCHAR(50) NOT NULL,
  stage VARCHAR(50) NOT NULL DEFAULT 'DISCOVERY',
  value NUMERIC(10,2) DEFAULT 0,
  currency VARCHAR(10) DEFAULT 'EUR',
  confidence NUMERIC(3,2) DEFAULT 0.5,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Tabella PORTFOLIO_PROJECTS
CREATE TABLE IF NOT EXISTS portfolio_projects (
  id VARCHAR(100) PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  github_url TEXT,
  commercial_score INTEGER DEFAULT 0,
  pricing_tier TEXT,
  status VARCHAR(50) DEFAULT 'ACTIVE',
  metadata JSONB DEFAULT '{}'::jsonb,
  last_audited_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indici per prestazioni e ricerche veloci
CREATE INDEX IF NOT EXISTS idx_prospects_mode ON prospects(mode);
CREATE INDEX IF NOT EXISTS idx_prospects_status ON prospects(status);
CREATE INDEX IF NOT EXISTS idx_outreach_status ON outreach_messages(status);
CREATE INDEX IF NOT EXISTS idx_outreach_prospect_id ON outreach_messages(prospect_id);
