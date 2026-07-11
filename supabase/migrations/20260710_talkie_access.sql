-- Add has_talkie_access flag to profiles
alter table public.profiles
  add column if not exists has_talkie_access boolean not null default false;

-- Grant access to admin user
-- Run this separately in the Supabase SQL editor after creating the column:
-- update public.profiles set has_talkie_access = true
-- where id = (select id from auth.users where email = 'emerson.consolin@gmail.com');
