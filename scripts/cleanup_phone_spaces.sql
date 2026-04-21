-- ============================================================
-- Phone Number Space Cleanup
-- Removes all spaces from phone/WhatsApp number columns.
-- Safe to run multiple times (idempotent).
-- Run in Supabase SQL Editor (service role).
-- ============================================================

-- Preview what will change before running UPDATE statements:
-- SELECT id, phone_number, REPLACE(phone_number, ' ', '') AS cleaned FROM public.registrations WHERE phone_number LIKE '% %';
-- SELECT id, wa_number,    REPLACE(wa_number,    ' ', '') AS cleaned FROM public.registrations WHERE wa_number    LIKE '% %';
-- SELECT id, phone_number, REPLACE(phone_number, ' ', '') AS cleaned FROM public.students       WHERE phone_number LIKE '% %';
-- SELECT id, phone_number, REPLACE(phone_number, ' ', '') AS cleaned FROM public.contacts        WHERE phone_number LIKE '% %';
-- SELECT id, phone,        REPLACE(phone,        ' ', '') AS cleaned FROM public.crm_leads       WHERE phone        LIKE '% %';

-- 1. registrations.phone_number
UPDATE public.registrations
SET phone_number = REPLACE(phone_number, ' ', '')
WHERE phone_number LIKE '% %';

-- 2. registrations.wa_number
UPDATE public.registrations
SET wa_number = REPLACE(wa_number, ' ', '')
WHERE wa_number LIKE '% %';

-- 3. students.phone_number
UPDATE public.students
SET phone_number = REPLACE(phone_number, ' ', '')
WHERE phone_number LIKE '% %';

-- 4. contacts.phone_number
UPDATE public.contacts
SET phone_number = REPLACE(phone_number, ' ', '')
WHERE phone_number LIKE '% %';

-- 5. crm_leads.phone
UPDATE public.crm_leads
SET phone = REPLACE(phone, ' ', '')
WHERE phone LIKE '% %';
