-- Patch registrations table to support program/batch tracking

alter table public.registrations add column if not exists program_id uuid;
alter table public.registrations add column if not exists program_name text;
alter table public.registrations add column if not exists batch_name text;

create index if not exists registrations_program_id_idx on public.registrations(program_id);
create index if not exists registrations_batch_name_idx on public.registrations(batch_name);
