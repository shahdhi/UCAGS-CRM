-- UCAGS CRM: Google Integrations table
-- Stores per-user Google OAuth refresh tokens for Google Contacts sync.

create table if not exists public.google_integrations (
  id uuid primary key default gen_random_uuid(),

  provider text not null default 'google',

  -- Supabase auth user id (preferred)
  user_id uuid,

  -- Legacy session username (fallback when not using Supabase auth)
  username text,

  google_email text,

  -- Tokens
  refresh_token text,
  access_token text,
  token_type text,
  scope text,
  expiry_date timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Ensure 1 row per Supabase user_id when present
create unique index if not exists google_integrations_user_id_unique
  on public.google_integrations (provider, user_id)
  where user_id is not null;

-- Ensure 1 row per legacy username when user_id is null
create unique index if not exists google_integrations_username_unique
  on public.google_integrations (provider, username)
  where user_id is null;

-- Trigger: auto-update updated_at
create or replace function public.set_google_integrations_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_google_integrations_updated_at on public.google_integrations;
create trigger trg_google_integrations_updated_at
before update on public.google_integrations
for each row
execute function public.set_google_integrations_updated_at();
