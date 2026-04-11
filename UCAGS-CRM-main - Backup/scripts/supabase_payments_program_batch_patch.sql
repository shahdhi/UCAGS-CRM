-- Patch payments to include batch/program and installment due dates

alter table public.payments add column if not exists batch_name text;
alter table public.payments add column if not exists program_id uuid;
alter table public.payments add column if not exists program_name text;

alter table public.payments add column if not exists payment_plan_id uuid;
alter table public.payments add column if not exists installment_due_date date;

create index if not exists payments_batch_idx on public.payments(batch_name);
create index if not exists payments_program_idx on public.payments(program_id);
