-- 小公主存股星球 M2: full V3.6 state in a private, versioned cloud document.
-- Paste into Supabase SQL Editor (once). No Shioaji credentials in this script.
create extension if not exists pgcrypto;

create table if not exists public.portfolio_states (
  user_id uuid primary key references auth.users(id) on delete cascade,
  payload jsonb not null,
  revision bigint not null default 1 check (revision>=1),
  updated_at timestamptz not null default now()
);
alter table public.portfolio_states enable row level security;
revoke all on public.portfolio_states from anon, authenticated;
grant select on public.portfolio_states to authenticated;
drop policy if exists portfolio_owner_read on public.portfolio_states;
create policy portfolio_owner_read on public.portfolio_states for select to authenticated
  using ((select auth.uid())=user_id);

-- A single authenticated RPC handles all writes and rejects stale revisions.
-- Role 'authenticated' has NO direct INSERT/UPDATE/DELETE on the table.
create or replace function public.save_princess_state(
  p_payload jsonb, p_expected_revision bigint
) returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_new_rev bigint;
begin
  if v_user is null then
    raise exception 'Authentication required' using errcode='42501';
  end if;
  if p_payload is null or jsonb_typeof(p_payload)<>'object'
    or (p_payload->>'version') <> '2'
    or jsonb_typeof(p_payload->'settings')<>'object'
    or jsonb_typeof(p_payload->'events')<>'array'
    or jsonb_typeof(p_payload->'snaps')<>'array'
    or jsonb_typeof(p_payload->'quotes')<>'object'
    or octet_length(p_payload::text)>2000000 then
    raise exception 'Invalid or oversized investment state' using errcode='22023';
  end if;
  if p_expected_revision is null then
    -- Only a first-time account can use NULL; cannot overwrite an existing account.
    insert into public.portfolio_states(user_id,payload,revision)
    values(v_user,p_payload,1)
    returning revision into v_new_rev;
  else
    update public.portfolio_states
       set payload=p_payload, revision=revision+1, updated_at=now()
     where user_id=v_user and revision=p_expected_revision
     returning revision into v_new_rev;
    if not found then
      raise exception 'version_conflict: data has changed on another device' using errcode='40001';
    end if;
  end if;
  return v_new_rev;
exception
  when unique_violation then
    raise exception 'version_conflict: portfolio already exists' using errcode='40001';
end;
$$;
revoke all on function public.save_princess_state(jsonb,bigint) from public, anon;
grant execute on function public.save_princess_state(jsonb,bigint) to authenticated;

-- Authorized cloud market publisher writes market snapshots with backend-only credentials.
-- This schema does not itself connect to Shioaji or supply a market-feed license.
create table if not exists public.market_snapshots (
  symbol text primary key check(symbol in ('0050','00646')),
  last_price numeric(15,4) not null check(last_price>0),
  daily_k numeric(8,3) check(daily_k between 0 and 100),
  hourly_k numeric(8,3) check(hourly_k between 0 and 100),
  source_time timestamptz not null,
  source_kind text not null check(source_kind in ('production_authorized','simulation','delayed')),
  updated_at timestamptz not null default now()
);
-- Safe incremental migration from M1's market table.
alter table public.market_snapshots
  add column if not exists daily_d numeric(8,3),
  add column if not exists hourly_d numeric(8,3),
  add column if not exists highest_10d numeric(15,4),
  add column if not exists daily_completed boolean not null default false,
  add column if not exists hourly_completed boolean not null default false;
alter table public.market_snapshots enable row level security;
revoke all on public.market_snapshots from anon, authenticated;
grant select on public.market_snapshots to authenticated;
drop policy if exists market_authenticated_read on public.market_snapshots;
create policy market_authenticated_read on public.market_snapshots
  for select to authenticated using(true);
-- No browser-side INSERT or UPDATE policy. Never publish brokerage/API/private keys.
-- Confirm the market-data redistribution/license terms before enabling a publisher.
