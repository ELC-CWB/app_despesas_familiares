-- Personal-assistant context for Jane (Talkie): default city (weather tool) and
-- free-text family context (spouse/kids), both user-edited in the Talkie settings panel.
alter table public.talkie_memory
  add column if not exists city text not null default '',
  add column if not exists family_context text not null default '';
