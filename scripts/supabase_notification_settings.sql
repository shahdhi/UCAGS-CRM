-- Per-user notification settings

create table if not exists public.user_notification_settings (
  user_id uuid primary key,

  browser_alerts_enabled boolean not null default false,

  officer_daily_reports boolean not null default true,
  officer_assignments boolean not null default true,
  officer_followups boolean not null default true,

  admin_leave_requests boolean not null default true,
  admin_daily_reports boolean not null default true,

  updated_at timestamptz not null default now()
);

create index if not exists idx_user_notification_settings_user on public.user_notification_settings (user_id);
