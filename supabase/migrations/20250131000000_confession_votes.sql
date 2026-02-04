-- Confession votes: one vote per ticket, non-cancellable
-- Used by confessions-browse flow (ticket-gated list + vote)

CREATE TABLE IF NOT EXISTS confession_votes (
    ticket_code TEXT PRIMARY KEY REFERENCES tickets(code) ON DELETE CASCADE,
    confession_id UUID NOT NULL REFERENCES confessions(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_confession_votes_confession_id ON confession_votes(confession_id);

-- RLS: deny all anon access; only Edge Functions (service role) can access
ALTER TABLE confession_votes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Deny all anon access" ON confession_votes;
CREATE POLICY "Deny all anon access" ON confession_votes
    FOR ALL
    TO anon
    USING (false)
    WITH CHECK (false);
