-- Create confessions table for anonymous confession pipeline
CREATE TABLE IF NOT EXISTS confessions (
    id BIGSERIAL PRIMARY KEY,
    confession_text TEXT NOT NULL,
    secret_key TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create index on secret_key for potential lookups
CREATE INDEX IF NOT EXISTS idx_confessions_secret_key ON confessions(secret_key);

-- Create index on created_at for potential time-based queries
CREATE INDEX IF NOT EXISTS idx_confessions_created_at ON confessions(created_at);



