-- TikTok tables are separate from Etsy (etsy_oauth_sessions / etsy_tokens).
-- Run in the same Supabase project; do not reuse Etsy tables.

create table if not exists tiktok_oauth_sessions (
  state text primary key,
  verifier text,
  created_at timestamptz not null default now()
);

create table if not exists tiktok_tokens (
  id text primary key,
  open_id text,
  username text,
  access_token text not null,
  refresh_token text,
  scopes text,
  expires_at timestamptz,
  refresh_expires_at timestamptz,
  updated_at timestamptz not null default now()
);
