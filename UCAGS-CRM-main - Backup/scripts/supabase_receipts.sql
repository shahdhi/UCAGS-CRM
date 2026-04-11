-- Supabase migration: Receipts table + ordered receipt numbers (UC0001)
-- Date: 2026-02-20

create extension if not exists "pgcrypto";

-- Payments may already have receipt_no; ensure it's unique if used
alter table public.payments
  add column if not exists receipt_no text;

create unique index if not exists payments_receipt_no_unique
  on public.payments (receipt_no)
  where receipt_no is not null;

-- Receipts table: one receipt per confirmed payment
create table if not exists public.receipts (
  id uuid primary key default gen_random_uuid(),
  receipt_no text not null unique,
  payment_id uuid unique,
  registration_id uuid,
  created_at timestamptz not null default now()
);

-- Sequence for strictly ordered numbers
create sequence if not exists public.receipt_number_seq
  as bigint
  start with 1
  increment by 1
  minvalue 1;

-- Trigger to generate UC0001 style receipt numbers
create or replace function public.generate_uc_receipt_no()
returns trigger
language plpgsql
as $$
declare
  n bigint;
begin
  if new.receipt_no is null or length(trim(new.receipt_no)) = 0 then
    n := nextval('public.receipt_number_seq');
    new.receipt_no := 'UC' || lpad(n::text, 4, '0');
  end if;
  return new;
end;
$$;

drop trigger if exists trg_receipts_generate_no on public.receipts;
create trigger trg_receipts_generate_no
before insert on public.receipts
for each row
execute function public.generate_uc_receipt_no();

-- Backfill: align sequence to current max UC#### in receipts/payments
DO $$
DECLARE
  max_n bigint;
BEGIN
  select max((regexp_replace(receipt_no, '[^0-9]', '', 'g'))::bigint)
    into max_n
  from public.receipts
  where receipt_no is not null and receipt_no ~ '[0-9]';

  if max_n is null then
    select max((regexp_replace(receipt_no, '[^0-9]', '', 'g'))::bigint)
      into max_n
    from public.payments
    where receipt_no is not null and receipt_no ~ '[0-9]';
  end if;

  if max_n is not null then
    perform setval('public.receipt_number_seq', max_n);
  end if;
END;
$$;
