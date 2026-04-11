-- Patch payments table to support admin payment workflow + installments

alter table public.payments add column if not exists registration_name text;
alter table public.payments add column if not exists email_sent boolean not null default false;
alter table public.payments add column if not exists whatsapp_sent boolean not null default false;
alter table public.payments add column if not exists payment_method text;
alter table public.payments add column if not exists slip_received boolean not null default false;
alter table public.payments add column if not exists is_confirmed boolean not null default false;
alter table public.payments add column if not exists confirmed_at timestamptz;
alter table public.payments add column if not exists confirmed_by text;
alter table public.payments add column if not exists receipt_no text;

-- Installment support
alter table public.payments add column if not exists installment_group_id uuid;
alter table public.payments add column if not exists installment_no int;

create index if not exists payments_registration_name_idx on public.payments(registration_name);
create index if not exists payments_confirmed_idx on public.payments(is_confirmed, created_at desc);
create index if not exists payments_installment_group_idx on public.payments(installment_group_id);
