-- Supabase Schema for WebSmitherz Cold Caller & Closer Cockpit
-- Run this in your Supabase SQL Editor

-- 1. Enable UUID extension
create extension if not exists "uuid-ossp";

-- 2. Team Table (Callers & Closers)
create table if not exists team_members (
    id uuid default uuid_generate_v4() primary key,
    name text not null,
    email text unique not null,
    role text not null check (role in ('caller', 'closer', 'admin')),
    phone text,
    is_active boolean default true,
    created_at timestamp with time zone default now()
);

-- 3. Leads Table (Cold Caller Pipeline)
create table if not exists leads (
    id uuid default uuid_generate_v4() primary key,
    business_name text not null,
    contact_name text,
    phone text not null,
    email text,
    website text,
    city text,
    state text,
    industry text default 'Contractor / Trades',
    status text default 'New' check (status in ('New', 'Attempting', 'In Call', 'Not Interested', 'Call Back', 'Voicemail', 'Qualified', 'Appointment Booked', 'Disqualified')),
    assigned_caller text,
    created_at timestamp with time zone default now(),
    updated_at timestamp with time zone default now()
);

-- 4. Call Logs & Interaction History
create table if not exists call_logs (
    id uuid default uuid_generate_v4() primary key,
    lead_id uuid references leads(id) on delete cascade,
    caller_name text not null,
    call_duration_seconds int default 0,
    disposition text not null,
    notes text,
    created_at timestamp with time zone default now()
);

-- 5. Appointments & Closer Dossiers (Strict Qualification Enforced)
create table if not exists appointments (
    id uuid default uuid_generate_v4() primary key,
    lead_id uuid references leads(id) on delete cascade,
    business_name text not null,
    contact_name text not null,
    phone text not null,
    email text not null,
    website text,
    
    -- Mandatory 4-Point Qualification Gate Data
    decision_maker_confirmed boolean default false,
    lead_generation_bottleneck text not null, -- e.g. 'Word of mouth only', 'Unclickable mobile phone number', 'Slow website (5s+)', 'No map rankings'
    monthly_job_capacity text, -- e.g. 'Looking for 3-5 new projects/month'
    agreed_deliverable text not null, -- e.g. '1-Page Forensic Mobile Latency & Map Audit'
    call_recording_or_notes text,
    
    -- Scheduling Details
    appointment_time timestamp with time zone not null,
    timezone text default 'EST',
    assigned_closer text default 'Closer 1',
    booked_by_caller text not null,
    
    -- Closer Outcome & Status
    status text default 'Scheduled' check (status in ('Scheduled', 'Confirmed', 'Showed / Pitched', 'Rescheduled', 'No Show / Voicemail', 'Call Dropped / Hung Up', 'Won / Closed', 'Lost / Disqualified')),
    closer_notes text,
    outcome_reason text,
    
    created_at timestamp with time zone default now(),
    updated_at timestamp with time zone default now()
);

-- Enable Realtime
alter publication supabase_realtime add table leads;
alter publication supabase_realtime add table appointments;
alter publication supabase_realtime add table call_logs;
