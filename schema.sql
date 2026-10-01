-- ============================================================
-- WebSmitherz Sales Operations CRM & Cockpit — PostgreSQL / Supabase Schema
-- Specification: WebSmitherz-CRM-Build-Spec.md · v1.0
-- Charset: UTF-8 · All Timestamps Stored in UTC with Timezone
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Drop existing legacy tables
DROP TABLE IF EXISTS notifications CASCADE;
DROP TABLE IF EXISTS login_events CASCADE;
DROP TABLE IF EXISTS settings CASCADE;
DROP TABLE IF EXISTS payment_templates CASCADE;
DROP TABLE IF EXISTS price_exceptions CASCADE;
DROP TABLE IF EXISTS pricing_kb CASCADE;
DROP TABLE IF EXISTS field_changes CASCADE;
DROP TABLE IF EXISTS activity_log CASCADE;
DROP TABLE IF EXISTS sales CASCADE;
DROP TABLE IF EXISTS tasks CASCADE;
DROP TABLE IF EXISTS email_events CASCADE;
DROP TABLE IF EXISTS appointments CASCADE;
DROP TABLE IF EXISTS qualifications CASCADE;
DROP TABLE IF EXISTS call_logs CASCADE;
DROP TABLE IF EXISTS leads CASCADE;
DROP TABLE IF EXISTS users CASCADE;
DROP TABLE IF EXISTS team_members CASCADE;

-- ------------------------------------------------------------
-- users
-- ------------------------------------------------------------
CREATE TABLE users (
  id            UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  username      VARCHAR(50) NOT NULL UNIQUE,
  full_name     VARCHAR(100) NOT NULL,
  email         VARCHAR(190) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  role          VARCHAR(30) NOT NULL CHECK (role IN ('super_admin','admin','setter','closer')),
  timezone      VARCHAR(64) NOT NULL DEFAULT 'UTC',
  is_active     BOOLEAN NOT NULL DEFAULT TRUE,
  last_login_at TIMESTAMPTZ NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ------------------------------------------------------------
-- leads
-- ------------------------------------------------------------
CREATE TABLE leads (
  id               UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  business_name    VARCHAR(190) NOT NULL,
  owner_name       VARCHAR(190) NULL,
  phone            VARCHAR(40) NOT NULL,
  whatsapp         VARCHAR(40) NULL,
  email            VARCHAR(190) NULL,
  facebook_url     VARCHAR(500) NULL,
  website_url      VARCHAR(500) NULL,
  lead_source      VARCHAR(100) NOT NULL DEFAULT 'Cold Call',
  prospect_timezone VARCHAR(64) NULL,
  notes            TEXT NULL,
  status           VARCHAR(30) NOT NULL DEFAULT 'new' CHECK (status IN (
                     'new','assigned','in_progress','callback','interested',
                     'appointment','proposal','won','lost','nurture',
                     'not_interested','bad_number','dnc'
                   )),
  assigned_setter_id UUID NULL REFERENCES users(id) ON DELETE SET NULL,
  assigned_setter_name VARCHAR(100) NULL,
  dnc_reason       TEXT NULL,
  dnc_set_by       UUID NULL REFERENCES users(id) ON DELETE SET NULL,
  dnc_set_at       TIMESTAMPTZ NULL,
  created_by       UUID NULL REFERENCES users(id) ON DELETE SET NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_leads_status_setter ON leads(status, assigned_setter_id);
CREATE INDEX idx_leads_phone ON leads(phone);

-- ------------------------------------------------------------
-- call_logs
-- ------------------------------------------------------------
CREATE TABLE call_logs (
  id             UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  lead_id        UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  user_id        UUID NULL REFERENCES users(id) ON DELETE SET NULL,
  caller_name    VARCHAR(100) NOT NULL,
  started_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  duration_sec   INTEGER NULL DEFAULT 0,
  outcome        VARCHAR(30) NOT NULL CHECK (outcome IN (
                   'no_answer','voicemail','busy','wrong_number','disconnected',
                   'not_interested','interested','callback_requested',
                   'appointment_set','dnc','other'
                 )),
  objection      VARCHAR(50) NULL CHECK (objection IS NULL OR objection IN (
                   'not_interested_in_service','not_interested_now','has_provider',
                   'price_concern','no_need_website','no_need_marketing',
                   'bad_timing','distrust_cold_call','other'
                 )),
  next_action    VARCHAR(30) NULL CHECK (next_action IS NULL OR next_action IN (
                   'call_again','send_email','send_sms','follow_up','none','appointment'
                 )),
  next_action_at TIMESTAMPTZ NULL,
  notes          TEXT NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_calls_lead_time ON call_logs(lead_id, started_at);
CREATE INDEX idx_calls_user_time ON call_logs(user_id, started_at);

-- ------------------------------------------------------------
-- qualifications
-- ------------------------------------------------------------
CREATE TABLE qualifications (
  id               UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  lead_id          UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  call_log_id      UUID NULL REFERENCES call_logs(id) ON DELETE SET NULL,
  user_id          UUID NULL REFERENCES users(id) ON DELETE SET NULL,
  caller_name      VARCHAR(100) NOT NULL,
  decision_maker   VARCHAR(20) NOT NULL CHECK (decision_maker IN ('yes','no','someone_else','unclear')),
  current_marketing JSONB NOT NULL DEFAULT '[]'::jsonb,
  has_website      VARCHAR(30) NOT NULL CHECK (has_website IN ('no_website','has_website','needs_improvement','unknown')),
  main_goal        JSONB NOT NULL DEFAULT '[]'::jsonb,
  pain_point       TEXT NOT NULL,
  interest_level   VARCHAR(30) NOT NULL CHECK (interest_level IN ('just_curious','interested','actively_looking','wants_proposal','ready_to_buy')),
  timeline         VARCHAR(30) NOT NULL CHECK (timeline IN ('just_researching','within_30_days','1_3_months','ready_now','unknown')),
  budget           VARCHAR(30) NOT NULL CHECK (budget IN ('unknown','under_500','500_999','1000_1999','2000_plus')),
  prospect_said    TEXT NOT NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_qual_lead ON qualifications(lead_id, created_at);

-- ------------------------------------------------------------
-- appointments
-- ------------------------------------------------------------
CREATE TABLE appointments (
  id                 UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  lead_id            UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  qualification_id   UUID NULL REFERENCES qualifications(id) ON DELETE SET NULL,
  business_name      VARCHAR(190) NOT NULL,
  contact_name       VARCHAR(190) NOT NULL,
  phone              VARCHAR(40) NOT NULL,
  email              VARCHAR(190) NOT NULL,
  website            VARCHAR(500) NULL,
  appointment_type   VARCHAR(40) NOT NULL CHECK (appointment_type IN (
                       'free_audit','website_consultation','seo_consultation',
                       'marketing_consultation','discovery','follow_up','proposal_review'
                     )),
  local_date         DATE NOT NULL,
  local_time         TIME NOT NULL,
  prospect_timezone  VARCHAR(64) NOT NULL,
  utc_start          TIMESTAMPTZ NOT NULL,
  duration_min       SMALLINT NOT NULL DEFAULT 30,
  setter_id          UUID NULL REFERENCES users(id) ON DELETE SET NULL,
  setter_name        VARCHAR(100) NOT NULL,
  closer_id          UUID NULL REFERENCES users(id) ON DELETE SET NULL,
  closer_name        VARCHAR(100) NOT NULL,
  meeting_platform   VARCHAR(20) NOT NULL CHECK (meeting_platform IN ('zoom','google_meet','phone_call')),
  meeting_link       VARCHAR(500) NULL,
  status             VARCHAR(20) NOT NULL DEFAULT 'scheduled' CHECK (status IN (
                       'scheduled','confirmed','attended','no_show','rescheduled','cancelled'
                     )),
  confirmation_status VARCHAR(30) NOT NULL DEFAULT 'unconfirmed' CHECK (confirmation_status IN (
                       'unconfirmed','email_sent','confirmed','no_response','reschedule_requested','cancelled'
                     )),
  reminder_24h_sent_at TIMESTAMPTZ NULL,
  reminder_2h_sent_at  TIMESTAMPTZ NULL,
  reminder_15m_sent_at TIMESTAMPTZ NULL,
  gate_business_consult BOOLEAN NOT NULL DEFAULT FALSE,
  gate_expressed_interest BOOLEAN NOT NULL DEFAULT FALSE,
  gate_agreed_time      BOOLEAN NOT NULL DEFAULT FALSE,
  gate_knows_contact_method BOOLEAN NOT NULL DEFAULT FALSE,
  gate_contact_on_file  VARCHAR(10) NULL CHECK (gate_contact_on_file IN ('yes','na')),
  admin_override        BOOLEAN NOT NULL DEFAULT FALSE,
  communicated          JSONB NULL DEFAULT '[]'::jsonb,
  price_quoted          NUMERIC(10,2) NULL,
  noshaw_prev_confirmed VARCHAR(10) NULL CHECK (noshaw_prev_confirmed IS NULL OR noshaw_prev_confirmed IN ('yes','no')),
  noshaw_reason         VARCHAR(30) NULL CHECK (noshaw_reason IS NULL OR noshaw_reason IN ('forgot','busy','technical_issue','never_responded','unknown','other')),
  meeting_outcome       VARCHAR(30) NULL CHECK (meeting_outcome IS NULL OR meeting_outcome IN (
                          'closed','proposal_sent','follow_up_required','not_qualified','not_interested','lost','other'
                        )),
  outcome_notes         TEXT NULL,
  rescheduled_from_id   UUID NULL REFERENCES appointments(id) ON DELETE SET NULL,
  created_by            UUID NULL REFERENCES users(id) ON DELETE SET NULL,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_appt_utc ON appointments(utc_start);
CREATE INDEX idx_appt_closer_status ON appointments(closer_name, status);
CREATE INDEX idx_appt_setter_status ON appointments(setter_name, status);
CREATE INDEX idx_appt_lead ON appointments(lead_id);

-- ------------------------------------------------------------
-- tasks
-- ------------------------------------------------------------
CREATE TABLE tasks (
  id             UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  lead_id        UUID NULL REFERENCES leads(id) ON DELETE CASCADE,
  appointment_id UUID NULL REFERENCES appointments(id) ON DELETE CASCADE,
  type           VARCHAR(30) NOT NULL CHECK (type IN (
                   'callback','confirmation_call','send_confirmation','recovery',
                   'follow_up','proposal_follow_up','custom'
                 )),
  title          VARCHAR(255) NOT NULL,
  due_at         TIMESTAMPTZ NOT NULL,
  due_timezone   VARCHAR(64) NOT NULL DEFAULT 'UTC',
  priority       VARCHAR(10) NOT NULL DEFAULT 'normal' CHECK (priority IN ('low','normal','high')),
  assigned_to    VARCHAR(100) NOT NULL,
  status         VARCHAR(20) NOT NULL DEFAULT 'open' CHECK (status IN ('open','completed','snoozed','cancelled')),
  completion_note TEXT NULL,
  completed_at   TIMESTAMPTZ NULL,
  created_by     VARCHAR(100) NOT NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_task_due ON tasks(assigned_to, status, due_at);

-- ------------------------------------------------------------
-- sales
-- ------------------------------------------------------------
CREATE TABLE sales (
  id                  UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  lead_id             UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  appointment_id      UUID NOT NULL REFERENCES appointments(id) ON DELETE CASCADE,
  stage               VARCHAR(20) NOT NULL CHECK (stage IN ('proposal','closed')),
  proposal_amount     NUMERIC(10,2) NULL,
  deal_value          NUMERIC(10,2) NULL,
  services            JSONB NULL DEFAULT '[]'::jsonb,
  payment_received    VARCHAR(10) NULL CHECK (payment_received IS NULL OR payment_received IN ('yes','no','partial')),
  setter_commission_pct NUMERIC(5,2) NULL,
  closer_commission_pct NUMERIC(5,2) NULL,
  price_exception_id  UUID NULL,
  proposal_follow_up_at TIMESTAMPTZ NULL,
  notes               TEXT NULL,
  recorded_by         VARCHAR(100) NOT NULL,
  recorded_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ------------------------------------------------------------
-- activity_log & field_changes (APPEND-ONLY)
-- ------------------------------------------------------------
CREATE TABLE activity_log (
  id          BIGSERIAL PRIMARY KEY,
  actor_name  VARCHAR(100) NULL,
  entity_type VARCHAR(30) NOT NULL CHECK (entity_type IN (
                'lead','call_log','qualification','appointment','task','sale',
                'user','email_event','setting','price_exception'
              )),
  entity_id   TEXT NOT NULL,
  action      VARCHAR(60) NOT NULL,
  details     JSONB NULL,
  ip          VARCHAR(45) NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_activity_entity ON activity_log(entity_type, entity_id, created_at);

-- ------------------------------------------------------------
-- pricing_kb
-- ------------------------------------------------------------
CREATE TABLE pricing_kb (
  id             UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  service        VARCHAR(100) NOT NULL,
  plan_name      VARCHAR(100) NOT NULL,
  standard_price NUMERIC(10,2) NOT NULL,
  min_price      NUMERIC(10,2) NOT NULL,
  billing        VARCHAR(20) NOT NULL CHECK (billing IN ('one_time','monthly')),
  includes       TEXT NULL,
  is_active      BOOLEAN NOT NULL DEFAULT TRUE,
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Initial Pricing Seed
INSERT INTO pricing_kb (service, plan_name, standard_price, min_price, billing, includes) VALUES
('Website', 'Website Design + Hand-Coded Architecture', 1399.00, 999.00, 'one_time', 'Full website build, sub-0.8s load speed, 50% upfront, 50% on completion.'),
('SEO', 'Website SEO + Google Maps Local 3-Pack (Combined)', 800.00, 600.00, 'monthly', 'Complete on-page authority + verified local maps ranking pipeline.'),
('SEO', 'Single Track: Website SEO Only OR Local SEO Only', 400.00, 300.00, 'monthly', 'Single track technical ranking or GBP maps optimization.'),
('Social Media', 'Full Social Media Management', 1000.00, 800.00, 'monthly', 'Post design, copywriting, scheduling, and multi-channel handling.');

-- ------------------------------------------------------------
-- Realtime Publications
-- ------------------------------------------------------------
ALTER PUBLICATION supabase_realtime ADD TABLE leads;
ALTER PUBLICATION supabase_realtime ADD TABLE call_logs;
ALTER PUBLICATION supabase_realtime ADD TABLE qualifications;
ALTER PUBLICATION supabase_realtime ADD TABLE appointments;
ALTER PUBLICATION supabase_realtime ADD TABLE tasks;
ALTER PUBLICATION supabase_realtime ADD TABLE sales;
ALTER PUBLICATION supabase_realtime ADD TABLE activity_log;

-- ------------------------------------------------------------
-- Disable RLS for rapid caller operations
-- ------------------------------------------------------------
ALTER TABLE users DISABLE ROW LEVEL SECURITY;
ALTER TABLE leads DISABLE ROW LEVEL SECURITY;
ALTER TABLE call_logs DISABLE ROW LEVEL SECURITY;
ALTER TABLE qualifications DISABLE ROW LEVEL SECURITY;
ALTER TABLE appointments DISABLE ROW LEVEL SECURITY;
ALTER TABLE tasks DISABLE ROW LEVEL SECURITY;
ALTER TABLE sales DISABLE ROW LEVEL SECURITY;
ALTER TABLE activity_log DISABLE ROW LEVEL SECURITY;
ALTER TABLE pricing_kb DISABLE ROW LEVEL SECURITY;

