-- UCAGS CRM: Contacts table (CRM-only phase)
-- Stores contacts saved from lead details modal.

create table if not exists public.contacts (
  id uuid primary key default gen_random_uuid(),

  -- Link back to the source record (e.g. crm_leads)
  source_type text not null,
  source_id text not null,

  -- Display / formatted name (e.g., I/P/B14 John Silva)
  display_name text not null,

  -- Raw fields
  name text,
  phone_number text,
  email text,

  program_name text,
  program_short text,

  batch_name text,
  batch_no text,

  -- Assignment (current system assigns by officer name)
  assigned_to text,

  -- Future-proofing: officer user id (nullable for now)
  assigned_user_id uuid,

  created_by uuid,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Prevent duplicates when saving contact multiple times for the same lead
create unique index if not exists contacts_source_unique
  on public.contacts (source_type, source_id);

-- If you already created contacts with source_id uuid, run this migration:
-- alter table public.contacts alter column source_id type text using source_id::text;

-- Common search indexes
create index if not exists contacts_display_name_idx
  on public.contacts (display_name);

create index if not exists contacts_phone_idx
  on public.contacts (phone_number);

create index if not exists contacts_email_idx
  on public.contacts (email);

create index if not exists contacts_batch_idx
  on public.contacts (batch_name);

create index if not exists contacts_assigned_to_idx
  on public.contacts (assigned_to);

-- Trigger: auto-update updated_at
create or replace function public.set_contacts_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_contacts_updated_at on public.contacts;
create trigger trg_contacts_updated_at
before update on public.contacts
for each row
execute function public.set_contacts_updated_at();
