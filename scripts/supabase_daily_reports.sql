-- Supabase tables for Daily Officer Reports

create table if not exists public.daily_report_config (
  id integer primary key,
  timezone text not null default 'Asia/Colombo',
  grace_minutes integer not null default 20,
  slot1_time text not null default '10:30',
  slot1_label text not null default '10:30 AM',
  slot2_time text not null default '14:30',
  slot2_label text not null default '02:30 PM',
  slot3_time text not null default '18:00',
  slot3_label text not null default '06:00 PM',
  updated_at timestamptz not null default now()
);

-- seed singleton row (id=1)
insert into public.daily_report_config (id)
values (1)
on conflict (id) do nothing;

create table if not exists public.daily_officer_reports (
  id bigserial primary key,
  report_date date not null,
  slot_key text not null,
  officer_user_id uuid not null,
  officer_name text,

  fresh_calls_made integer not null default 0,
  fresh_messages_reached integer not null default 0,
  interested_leads integer not null default 0,
  followup_calls integer not null default 0,
  followup_messages integer not null default 0,
  followup_scheduled integer not null default 0,
  closures integer not null default 0,
  notes text,

  submitted_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (report_date, slot_key, officer_user_id)
);

create index if not exists idx_daily_officer_reports_date on public.daily_officer_reports (report_date);
create index if not exists idx_daily_officer_reports_officer on public.daily_officer_reports (officer_user_id);
