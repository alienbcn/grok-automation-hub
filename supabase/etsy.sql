create table if not exists etsy_oauth_sessions (
  state text primary key,
  verifier text not null,
  created_at timestamptz not null default now()
);

create table if not exists etsy_tokens (
  id text primary key,
  shop_id text,
  access_token text not null,
  refresh_token text,
  expires_at timestamptz,
  scopes text,
  updated_at timestamptz not null default now()
);

create table if not exists etsy_webhook_events (
  id text primary key,
  received_at timestamptz not null default now()
);

create table if not exists etsy_audit_log (
  id bigserial primary key,
  action text not null,
  detail jsonb,
  created_at timestamptz not null default now()
);
