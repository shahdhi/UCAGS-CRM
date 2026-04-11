-- Seed initial Programs + Current Batches
-- Run after scripts/supabase_programs.sql

-- 1) Create program (if not exists)
insert into public.programs (name, is_active)
values ('Diploma in Psychology', true)
on conflict (name) do update set is_active = excluded.is_active;

-- 2) Create current batch for that program
with p as (
  select id from public.programs where name = 'Diploma in Psychology' limit 1
)
insert into public.program_batches (program_id, batch_name, is_current, is_active)
select p.id, 'Batch-14', true, true from p
on conflict (program_id, batch_name) do update
  set is_active = excluded.is_active;

-- 3) Ensure only this batch is current for this program
update public.program_batches
set is_current = case when batch_name = 'Batch-14' then true else false end
where program_id = (select id from public.programs where name = 'Diploma in Psychology' limit 1);
