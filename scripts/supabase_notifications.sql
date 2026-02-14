-- Supabase tables for in-app notifications

create table if not exists public.user_notifications (
  id bigserial primary key,
  user_id uuid not null,
  category text not null default 'general',
  title text not null,
  message text not null,
  type text not null default 'info',
  created_at timestamptz not null default now(),
  read_at timestamptz
);

-- If table existed from earlier deployment, add missing columns safely
alter table public.user_notifications add column if not exists category text not null default 'general';

create index if not exists idx_user_notifications_user_time on public.user_notifications (user_id, created_at desc);
create index if not exists idx_user_notifications_user_read on public.user_notifications (user_id, read_at);
