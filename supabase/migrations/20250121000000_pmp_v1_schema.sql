-- PMP V1 Schema Migration
-- Transforms simple confession system into ticket-based lottery system

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Step 1: Migrate confessions table
-- First, create a new table with the new structure
CREATE TABLE IF NOT EXISTS confessions_new (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    text TEXT NOT NULL,
    text_hash TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Migrate existing data if any exists (generate text_hash for existing rows)
INSERT INTO confessions_new (id, text, text_hash, created_at)
SELECT 
    gen_random_uuid() as id,
    confession_text as text,
    encode(digest(confession_text, 'sha256'), 'hex') as text_hash,
    created_at
FROM confessions
ON CONFLICT DO NOTHING;

-- Drop old table and rename new one
DROP TABLE IF EXISTS confessions CASCADE;
ALTER TABLE confessions_new RENAME TO confessions;

-- Create index on text_hash for duplicate detection
CREATE INDEX IF NOT EXISTS idx_confessions_text_hash ON confessions(text_hash);
CREATE INDEX IF NOT EXISTS idx_confessions_created_at ON confessions(created_at);

-- Step 2: Create tickets table
CREATE TABLE IF NOT EXISTS tickets (
    code TEXT PRIMARY KEY,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Step 3: Create ticket_contacts table
CREATE TABLE IF NOT EXISTS ticket_contacts (
    ticket_code TEXT PRIMARY KEY REFERENCES tickets(code) ON DELETE CASCADE,
    email TEXT,
    instagram TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Step 4: Create lotteries table
CREATE TABLE IF NOT EXISTS lotteries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Step 5: Create lottery_winners table
CREATE TABLE IF NOT EXISTS lottery_winners (
    lottery_id UUID NOT NULL REFERENCES lotteries(id) ON DELETE CASCADE,
    ticket_code TEXT NOT NULL REFERENCES tickets(code) ON DELETE CASCADE,
    claimed_at TIMESTAMPTZ,
    PRIMARY KEY (lottery_id, ticket_code)
);

CREATE INDEX IF NOT EXISTS idx_lottery_winners_ticket_code ON lottery_winners(ticket_code);
CREATE INDEX IF NOT EXISTS idx_lottery_winners_claimed_at ON lottery_winners(claimed_at);

-- Step 6: Create submission_guard table (anti-spam)
CREATE TABLE IF NOT EXISTS submission_guard (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ip_hash TEXT NOT NULL,
    fp_hash TEXT NOT NULL,
    text_hash TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create indexes for rate limiting queries
CREATE INDEX IF NOT EXISTS idx_submission_guard_ip_hash_created_at ON submission_guard(ip_hash, created_at);
CREATE INDEX IF NOT EXISTS idx_submission_guard_fp_hash_created_at ON submission_guard(fp_hash, created_at);
CREATE INDEX IF NOT EXISTS idx_submission_guard_text_hash_created_at ON submission_guard(text_hash, created_at);

-- Step 7: Enable Row Level Security on all tables
ALTER TABLE confessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE ticket_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE lotteries ENABLE ROW LEVEL SECURITY;
ALTER TABLE lottery_winners ENABLE ROW LEVEL SECURITY;
ALTER TABLE submission_guard ENABLE ROW LEVEL SECURITY;

-- Step 8: Create RLS policies - deny all for anon role
-- All tables should only be accessible via Edge Functions using service role

-- Confessions: deny all anon access
DROP POLICY IF EXISTS "Deny all anon access" ON confessions;
CREATE POLICY "Deny all anon access" ON confessions
    FOR ALL
    TO anon
    USING (false)
    WITH CHECK (false);

-- Tickets: deny all anon access
DROP POLICY IF EXISTS "Deny all anon access" ON tickets;
CREATE POLICY "Deny all anon access" ON tickets
    FOR ALL
    TO anon
    USING (false)
    WITH CHECK (false);

-- Ticket contacts: deny all anon access
DROP POLICY IF EXISTS "Deny all anon access" ON ticket_contacts;
CREATE POLICY "Deny all anon access" ON ticket_contacts
    FOR ALL
    TO anon
    USING (false)
    WITH CHECK (false);

-- Lotteries: deny all anon access
DROP POLICY IF EXISTS "Deny all anon access" ON lotteries;
CREATE POLICY "Deny all anon access" ON lotteries
    FOR ALL
    TO anon
    USING (false)
    WITH CHECK (false);

-- Lottery winners: deny all anon access
DROP POLICY IF EXISTS "Deny all anon access" ON lottery_winners;
CREATE POLICY "Deny all anon access" ON lottery_winners
    FOR ALL
    TO anon
    USING (false)
    WITH CHECK (false);

-- Submission guard: deny all anon access
DROP POLICY IF EXISTS "Deny all anon access" ON submission_guard;
CREATE POLICY "Deny all anon access" ON submission_guard
    FOR ALL
    TO anon
    USING (false)
    WITH CHECK (false);

-- Note: Service role (authenticated via Edge Functions) will bypass RLS
-- All database operations must go through Edge Functions using service role key

