-- UCAGS CRM: Patch contacts table for Google Contacts sync

alter table public.contacts
  add column if not exists google_resource_name text,
  add column if not exists google_etag text;

create index if not exists contacts_google_resource_name_idx
  on public.contacts (google_resource_name);
