-- Kruispad Payment Request Approval Workflow
-- Lives in schema `kruispad` inside the existing shared Supabase project (cost decision 2026-10-27).
-- Enforces ADR-0002 parallel approval + ADR-0003 email action links.

create schema if not exists kruispad;

create extension if not exists "pgcrypto" with schema extensions;

-- Prefer extensions schema when present; fall back for local.
do $$
begin
  if not exists (select 1 from pg_namespace where nspname = 'extensions') then
    create schema extensions;
    create extension if not exists "pgcrypto" with schema extensions;
  end if;
exception when others then
  create extension if not exists "pgcrypto";
end $$;

-- ---------------------------------------------------------------------------
-- Enums (schema-qualified)
-- ---------------------------------------------------------------------------
do $$ begin
  create type kruispad.app_role as enum (
    'initiator', 'approver_fred', 'approver_anton', 'finance', 'admin'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type kruispad.request_status as enum (
    'drafted', 'submitted', 'fully_approved', 'paid', 'document_printed'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type kruispad.lane_status as enum ('pending', 'approved', 'declined');
exception when duplicate_object then null; end $$;

do $$ begin
  create type kruispad.payment_type as enum ('expense', 'maintenance', 'donation');
exception when duplicate_object then null; end $$;

do $$ begin
  create type kruispad.workflow_action as enum (
    'fred_approve', 'fred_decline', 'anton_approve', 'anton_decline',
    'finance_pay', 'finance_decline', 'print_document'
  );
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------
create table if not exists kruispad.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null unique,
  full_name text not null default '',
  role kruispad.app_role not null default 'initiator',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists profiles_role_idx on kruispad.profiles (role);

create table if not exists kruispad.payment_requests (
  id uuid primary key default gen_random_uuid(),
  initiator_id uuid not null references kruispad.profiles (id),
  date_requested date not null default (timezone('Africa/Johannesburg', now()))::date,
  beneficiary_name text not null default '',
  payment_type kruispad.payment_type not null default 'expense',
  description text not null default '',
  amount numeric(10, 2) not null default 0 check (amount >= 0),
  status kruispad.request_status not null default 'drafted',
  fred_status kruispad.lane_status not null default 'pending',
  fred_action_at timestamptz,
  fred_decline_reason text,
  anton_status kruispad.lane_status not null default 'pending',
  anton_action_at timestamptz,
  anton_decline_reason text,
  finance_action_at timestamptz,
  finance_decline_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists payment_requests_status_idx on kruispad.payment_requests (status);
create index if not exists payment_requests_initiator_idx on kruispad.payment_requests (initiator_id);

create table if not exists kruispad.request_attachments (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references kruispad.payment_requests (id) on delete cascade,
  storage_path text not null unique,
  file_name text not null,
  content_type text not null,
  byte_size bigint not null check (byte_size > 0),
  uploaded_by uuid not null references kruispad.profiles (id),
  created_at timestamptz not null default now()
);

create index if not exists request_attachments_request_idx on kruispad.request_attachments (request_id);

create table if not exists kruispad.audit_events (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references kruispad.payment_requests (id) on delete cascade,
  actor_id uuid references kruispad.profiles (id),
  action text not null,
  from_status kruispad.request_status,
  to_status kruispad.request_status,
  reason text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists audit_events_request_idx on kruispad.audit_events (request_id, created_at);

-- Opaque single-use action tokens for email deep links (ADR-0003)
create table if not exists kruispad.action_tokens (
  id uuid primary key default gen_random_uuid(),
  token_hash text not null unique,
  recipient_id uuid not null references kruispad.profiles (id) on delete cascade,
  request_id uuid not null references kruispad.payment_requests (id) on delete cascade,
  action kruispad.workflow_action not null,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now(),
  constraint action_tokens_expiry_future check (expires_at > created_at)
);

create index if not exists action_tokens_lookup_idx
  on kruispad.action_tokens (token_hash)
  where used_at is null;

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
create or replace function kruispad.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_updated_at on kruispad.profiles;
create trigger profiles_updated_at
  before update on kruispad.profiles
  for each row execute function kruispad.set_updated_at();

drop trigger if exists payment_requests_updated_at on kruispad.payment_requests;
create trigger payment_requests_updated_at
  before update on kruispad.payment_requests
  for each row execute function kruispad.set_updated_at();

create or replace function kruispad.current_role()
returns kruispad.app_role
language sql
stable
security definer
set search_path = kruispad, public
as $$
  select role from kruispad.profiles where id = auth.uid();
$$;

create or replace function kruispad.is_admin()
returns boolean
language sql
stable
security definer
set search_path = kruispad, public
as $$
  select exists (
    select 1 from kruispad.profiles where id = auth.uid() and role = 'admin'
  );
$$;

create or replace function kruispad.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = kruispad, public
as $$
begin
  insert into kruispad.profiles (id, email, full_name, role)
  values (
    new.id,
    coalesce(new.email, ''),
    coalesce(new.raw_user_meta_data->>'full_name', split_part(coalesce(new.email, ''), '@', 1)),
    'initiator'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created_kruispad on auth.users;
create trigger on_auth_user_created_kruispad
  after insert on auth.users
  for each row execute function kruispad.handle_new_user();

create or replace function kruispad.write_audit(
  p_request_id uuid,
  p_actor_id uuid,
  p_action text,
  p_from kruispad.request_status,
  p_to kruispad.request_status,
  p_reason text default null,
  p_payload jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = kruispad, public
as $$
begin
  insert into kruispad.audit_events (request_id, actor_id, action, from_status, to_status, reason, payload)
  values (p_request_id, p_actor_id, p_action, p_from, p_to, p_reason, coalesce(p_payload, '{}'::jsonb));
end;
$$;

create or replace function kruispad.sha256_hex(p_text text)
returns text
language sql
immutable
as $$
  select encode(extensions.digest(p_text, 'sha256'), 'hex');
$$;

-- ---------------------------------------------------------------------------
-- Transition internals (actor explicit — used by app session + email tokens)
-- ---------------------------------------------------------------------------
create or replace function kruispad._role_of(p_actor uuid)
returns kruispad.app_role
language sql
stable
security definer
set search_path = kruispad, public
as $$
  select role from kruispad.profiles where id = p_actor;
$$;

create or replace function kruispad.create_payment_request(
  p_date_requested date,
  p_beneficiary_name text,
  p_payment_type kruispad.payment_type,
  p_description text,
  p_amount numeric
)
returns kruispad.payment_requests
language plpgsql
security definer
set search_path = kruispad, public
as $$
declare
  r kruispad.payment_requests;
  v_role kruispad.app_role;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  v_role := kruispad._role_of(auth.uid());
  if v_role not in ('initiator', 'admin') then raise exception 'forbidden'; end if;

  insert into kruispad.payment_requests (
    initiator_id, date_requested, beneficiary_name, payment_type, description, amount, status
  ) values (
    auth.uid(), p_date_requested, coalesce(p_beneficiary_name, ''), p_payment_type,
    coalesce(p_description, ''), coalesce(p_amount, 0), 'drafted'
  ) returning * into r;

  perform kruispad.write_audit(r.id, auth.uid(), 'create_draft', null, 'drafted', null,
    jsonb_build_object('channel', 'app', 'amount', r.amount));
  return r;
end;
$$;

create or replace function kruispad.save_payment_request(
  p_id uuid,
  p_date_requested date,
  p_beneficiary_name text,
  p_payment_type kruispad.payment_type,
  p_description text,
  p_amount numeric
)
returns kruispad.payment_requests
language plpgsql
security definer
set search_path = kruispad, public
as $$
declare
  r kruispad.payment_requests;
  v_role kruispad.app_role;
begin
  select * into r from kruispad.payment_requests where id = p_id for update;
  if not found then raise exception 'not_found'; end if;
  v_role := kruispad._role_of(auth.uid());
  if r.initiator_id <> auth.uid() and v_role <> 'admin' then raise exception 'forbidden'; end if;
  if r.status <> 'drafted' then raise exception 'invalid_state: only drafted requests are editable'; end if;

  update kruispad.payment_requests set
    date_requested = p_date_requested,
    beneficiary_name = coalesce(p_beneficiary_name, ''),
    payment_type = p_payment_type,
    description = coalesce(p_description, ''),
    amount = coalesce(p_amount, 0),
    updated_at = now()
  where id = p_id
  returning * into r;

  perform kruispad.write_audit(r.id, auth.uid(), 'save_draft', 'drafted', 'drafted', null,
    jsonb_build_object('channel', 'app'));
  return r;
end;
$$;

create or replace function kruispad.submit_payment_request(p_id uuid)
returns kruispad.payment_requests
language plpgsql
security definer
set search_path = kruispad, public
as $$
declare
  r kruispad.payment_requests;
  v_role kruispad.app_role;
  v_attachments int;
begin
  select * into r from kruispad.payment_requests where id = p_id for update;
  if not found then raise exception 'not_found'; end if;
  v_role := kruispad._role_of(auth.uid());
  if r.initiator_id <> auth.uid() and v_role <> 'admin' then raise exception 'forbidden'; end if;
  if r.status <> 'drafted' then raise exception 'invalid_state: must be drafted'; end if;
  if length(trim(r.beneficiary_name)) = 0 then raise exception 'validation: beneficiary_name required'; end if;
  if length(trim(r.description)) = 0 then raise exception 'validation: description required'; end if;
  if r.amount <= 0 then raise exception 'validation: amount must be positive'; end if;
  select count(*) into v_attachments from kruispad.request_attachments where request_id = p_id;
  if v_attachments < 1 then raise exception 'validation: at least one attachment required'; end if;

  update kruispad.payment_requests set
    status = 'submitted',
    fred_status = 'pending',
    anton_status = 'pending',
    fred_action_at = null,
    anton_action_at = null,
    fred_decline_reason = null,
    anton_decline_reason = null,
    finance_action_at = null,
    finance_decline_reason = null,
    updated_at = now()
  where id = p_id
  returning * into r;

  perform kruispad.write_audit(r.id, auth.uid(), 'submit', 'drafted', 'submitted', null,
    jsonb_build_object('channel', 'app'));
  return r;
end;
$$;

create or replace function kruispad.apply_fred_approve(p_id uuid, p_actor uuid, p_channel text)
returns kruispad.payment_requests
language plpgsql
security definer
set search_path = kruispad, public
as $$
declare
  r kruispad.payment_requests;
  v_role kruispad.app_role;
  v_from kruispad.request_status;
  v_to kruispad.request_status;
  v_action text;
begin
  select * into r from kruispad.payment_requests where id = p_id for update;
  if not found then raise exception 'not_found'; end if;
  v_role := kruispad._role_of(p_actor);
  if v_role not in ('approver_fred', 'admin') then raise exception 'forbidden'; end if;
  if r.status <> 'submitted' then raise exception 'invalid_state'; end if;
  if r.fred_status <> 'pending' then raise exception 'conflict: fred already acted'; end if;

  v_from := r.status;
  if r.anton_status = 'approved' then
    v_to := 'fully_approved'; v_action := 'fred_approve_fully';
  else
    v_to := 'submitted'; v_action := 'fred_approve';
  end if;

  update kruispad.payment_requests set
    fred_status = 'approved', fred_action_at = now(), fred_decline_reason = null,
    status = v_to, updated_at = now()
  where id = p_id returning * into r;

  perform kruispad.write_audit(r.id, p_actor, v_action, v_from, v_to, null,
    jsonb_build_object('channel', p_channel));
  return r;
end;
$$;

create or replace function kruispad.apply_fred_decline(p_id uuid, p_actor uuid, p_reason text, p_channel text)
returns kruispad.payment_requests
language plpgsql
security definer
set search_path = kruispad, public
as $$
declare
  r kruispad.payment_requests;
  v_role kruispad.app_role;
begin
  if p_reason is null or length(trim(p_reason)) = 0 then
    raise exception 'validation: decline reason required';
  end if;
  select * into r from kruispad.payment_requests where id = p_id for update;
  if not found then raise exception 'not_found'; end if;
  v_role := kruispad._role_of(p_actor);
  if v_role not in ('approver_fred', 'admin') then raise exception 'forbidden'; end if;
  if r.status <> 'submitted' then raise exception 'invalid_state'; end if;

  update kruispad.payment_requests set
    status = 'drafted',
    fred_status = 'pending', fred_action_at = null, fred_decline_reason = null,
    anton_status = 'pending', anton_action_at = null, anton_decline_reason = null,
    finance_action_at = null, finance_decline_reason = null,
    updated_at = now()
  where id = p_id returning * into r;

  perform kruispad.write_audit(r.id, p_actor, 'fred_decline', 'submitted', 'drafted', trim(p_reason),
    jsonb_build_object('channel', p_channel));
  return r;
end;
$$;

create or replace function kruispad.apply_anton_approve(p_id uuid, p_actor uuid, p_channel text)
returns kruispad.payment_requests
language plpgsql
security definer
set search_path = kruispad, public
as $$
declare
  r kruispad.payment_requests;
  v_role kruispad.app_role;
  v_from kruispad.request_status;
  v_to kruispad.request_status;
  v_action text;
begin
  select * into r from kruispad.payment_requests where id = p_id for update;
  if not found then raise exception 'not_found'; end if;
  v_role := kruispad._role_of(p_actor);
  if v_role not in ('approver_anton', 'admin') then raise exception 'forbidden'; end if;
  if r.status <> 'submitted' then raise exception 'invalid_state'; end if;
  if r.anton_status <> 'pending' then raise exception 'conflict: anton already acted'; end if;

  v_from := r.status;
  if r.fred_status = 'approved' then
    v_to := 'fully_approved'; v_action := 'anton_approve_fully';
  else
    v_to := 'submitted'; v_action := 'anton_approve';
  end if;

  update kruispad.payment_requests set
    anton_status = 'approved', anton_action_at = now(), anton_decline_reason = null,
    status = v_to, updated_at = now()
  where id = p_id returning * into r;

  perform kruispad.write_audit(r.id, p_actor, v_action, v_from, v_to, null,
    jsonb_build_object('channel', p_channel));
  return r;
end;
$$;

create or replace function kruispad.apply_anton_decline(p_id uuid, p_actor uuid, p_reason text, p_channel text)
returns kruispad.payment_requests
language plpgsql
security definer
set search_path = kruispad, public
as $$
declare
  r kruispad.payment_requests;
  v_role kruispad.app_role;
begin
  if p_reason is null or length(trim(p_reason)) = 0 then
    raise exception 'validation: decline reason required';
  end if;
  select * into r from kruispad.payment_requests where id = p_id for update;
  if not found then raise exception 'not_found'; end if;
  v_role := kruispad._role_of(p_actor);
  if v_role not in ('approver_anton', 'admin') then raise exception 'forbidden'; end if;
  if r.status <> 'submitted' then raise exception 'invalid_state'; end if;

  update kruispad.payment_requests set
    status = 'drafted',
    fred_status = 'pending', fred_action_at = null, fred_decline_reason = null,
    anton_status = 'pending', anton_action_at = null, anton_decline_reason = null,
    finance_action_at = null, finance_decline_reason = null,
    updated_at = now()
  where id = p_id returning * into r;

  perform kruispad.write_audit(r.id, p_actor, 'anton_decline', 'submitted', 'drafted', trim(p_reason),
    jsonb_build_object('channel', p_channel));
  return r;
end;
$$;

create or replace function kruispad.apply_finance_pay(p_id uuid, p_actor uuid, p_channel text)
returns kruispad.payment_requests
language plpgsql
security definer
set search_path = kruispad, public
as $$
declare
  r kruispad.payment_requests;
  v_role kruispad.app_role;
begin
  select * into r from kruispad.payment_requests where id = p_id for update;
  if not found then raise exception 'not_found'; end if;
  v_role := kruispad._role_of(p_actor);
  if v_role not in ('finance', 'admin') then raise exception 'forbidden'; end if;
  if r.status <> 'fully_approved' then raise exception 'invalid_state'; end if;

  update kruispad.payment_requests set
    status = 'paid', finance_action_at = now(), finance_decline_reason = null, updated_at = now()
  where id = p_id returning * into r;

  perform kruispad.write_audit(r.id, p_actor, 'finance_pay', 'fully_approved', 'paid', null,
    jsonb_build_object('channel', p_channel));
  return r;
end;
$$;

create or replace function kruispad.apply_finance_decline(p_id uuid, p_actor uuid, p_reason text, p_channel text)
returns kruispad.payment_requests
language plpgsql
security definer
set search_path = kruispad, public
as $$
declare
  r kruispad.payment_requests;
  v_role kruispad.app_role;
begin
  if p_reason is null or length(trim(p_reason)) = 0 then
    raise exception 'validation: decline reason required';
  end if;
  select * into r from kruispad.payment_requests where id = p_id for update;
  if not found then raise exception 'not_found'; end if;
  v_role := kruispad._role_of(p_actor);
  if v_role not in ('finance', 'admin') then raise exception 'forbidden'; end if;
  if r.status <> 'fully_approved' then raise exception 'invalid_state'; end if;

  update kruispad.payment_requests set
    status = 'drafted',
    fred_status = 'pending', fred_action_at = null, fred_decline_reason = null,
    anton_status = 'pending', anton_action_at = null, anton_decline_reason = null,
    finance_action_at = null, finance_decline_reason = null,
    updated_at = now()
  where id = p_id returning * into r;

  perform kruispad.write_audit(r.id, p_actor, 'finance_decline', 'fully_approved', 'drafted', trim(p_reason),
    jsonb_build_object('channel', p_channel));
  return r;
end;
$$;

create or replace function kruispad.apply_print_document(p_id uuid, p_actor uuid, p_channel text)
returns kruispad.payment_requests
language plpgsql
security definer
set search_path = kruispad, public
as $$
declare
  r kruispad.payment_requests;
  v_role kruispad.app_role;
begin
  select * into r from kruispad.payment_requests where id = p_id for update;
  if not found then raise exception 'not_found'; end if;
  v_role := kruispad._role_of(p_actor);
  if v_role <> 'admin' then raise exception 'forbidden'; end if;
  if r.status <> 'paid' then raise exception 'invalid_state'; end if;

  update kruispad.payment_requests set status = 'document_printed', updated_at = now()
  where id = p_id returning * into r;

  perform kruispad.write_audit(r.id, p_actor, 'print_document', 'paid', 'document_printed', null,
    jsonb_build_object('channel', p_channel));
  return r;
end;
$$;

-- Session wrappers (auth.uid)
create or replace function kruispad.fred_approve(p_id uuid)
returns kruispad.payment_requests language plpgsql security definer set search_path = kruispad, public as $$
begin return kruispad.apply_fred_approve(p_id, auth.uid(), 'app'); end; $$;

create or replace function kruispad.fred_decline(p_id uuid, p_reason text)
returns kruispad.payment_requests language plpgsql security definer set search_path = kruispad, public as $$
begin return kruispad.apply_fred_decline(p_id, auth.uid(), p_reason, 'app'); end; $$;

create or replace function kruispad.anton_approve(p_id uuid)
returns kruispad.payment_requests language plpgsql security definer set search_path = kruispad, public as $$
begin return kruispad.apply_anton_approve(p_id, auth.uid(), 'app'); end; $$;

create or replace function kruispad.anton_decline(p_id uuid, p_reason text)
returns kruispad.payment_requests language plpgsql security definer set search_path = kruispad, public as $$
begin return kruispad.apply_anton_decline(p_id, auth.uid(), p_reason, 'app'); end; $$;

create or replace function kruispad.finance_pay(p_id uuid)
returns kruispad.payment_requests language plpgsql security definer set search_path = kruispad, public as $$
begin return kruispad.apply_finance_pay(p_id, auth.uid(), 'app'); end; $$;

create or replace function kruispad.finance_decline(p_id uuid, p_reason text)
returns kruispad.payment_requests language plpgsql security definer set search_path = kruispad, public as $$
begin return kruispad.apply_finance_decline(p_id, auth.uid(), p_reason, 'app'); end; $$;

create or replace function kruispad.print_document(p_id uuid)
returns kruispad.payment_requests language plpgsql security definer set search_path = kruispad, public as $$
begin return kruispad.apply_print_document(p_id, auth.uid(), 'app'); end; $$;

-- Email token: mint (service role / security definer) + consume
create or replace function kruispad.mint_action_token(
  p_recipient_id uuid,
  p_request_id uuid,
  p_action kruispad.workflow_action,
  p_ttl_hours int default 168
)
returns text
language plpgsql
security definer
set search_path = kruispad, public
as $$
declare
  v_raw text;
  v_hash text;
begin
  v_raw := encode(extensions.gen_random_bytes(32), 'hex');
  v_hash := kruispad.sha256_hex(v_raw);
  insert into kruispad.action_tokens (token_hash, recipient_id, request_id, action, expires_at)
  values (v_hash, p_recipient_id, p_request_id, p_action, now() + make_interval(hours => greatest(p_ttl_hours, 1)));
  return v_raw;
end;
$$;

create or replace function kruispad.peek_action_token(p_token text)
returns table (
  request_id uuid,
  action kruispad.workflow_action,
  recipient_id uuid,
  recipient_email text,
  recipient_name text,
  expires_at timestamptz,
  used_at timestamptz,
  beneficiary_name text,
  amount numeric,
  payment_type kruispad.payment_type,
  description text,
  status kruispad.request_status,
  date_requested date
)
language plpgsql
security definer
set search_path = kruispad, public
as $$
declare
  t kruispad.action_tokens;
  r kruispad.payment_requests;
  p kruispad.profiles;
begin
  select * into t from kruispad.action_tokens where token_hash = kruispad.sha256_hex(p_token);
  if not found then raise exception 'not_found'; end if;
  select * into r from kruispad.payment_requests where id = t.request_id;
  select * into p from kruispad.profiles where id = t.recipient_id;
  return query select
    t.request_id, t.action, t.recipient_id, p.email, p.full_name, t.expires_at, t.used_at,
    r.beneficiary_name, r.amount, r.payment_type, r.description, r.status, r.date_requested;
end;
$$;

create or replace function kruispad.execute_email_action(p_token text, p_reason text default null)
returns kruispad.payment_requests
language plpgsql
security definer
set search_path = kruispad, public
as $$
declare
  t kruispad.action_tokens;
  r kruispad.payment_requests;
begin
  select * into t from kruispad.action_tokens
  where token_hash = kruispad.sha256_hex(p_token)
  for update;
  if not found then raise exception 'not_found'; end if;
  if t.used_at is not null then raise exception 'conflict: token already used'; end if;
  if t.expires_at <= now() then raise exception 'conflict: token expired'; end if;

  -- Bind: only the intended action + recipient may proceed.
  case t.action
    when 'fred_approve' then r := kruispad.apply_fred_approve(t.request_id, t.recipient_id, 'email_link');
    when 'fred_decline' then r := kruispad.apply_fred_decline(t.request_id, t.recipient_id, p_reason, 'email_link');
    when 'anton_approve' then r := kruispad.apply_anton_approve(t.request_id, t.recipient_id, 'email_link');
    when 'anton_decline' then r := kruispad.apply_anton_decline(t.request_id, t.recipient_id, p_reason, 'email_link');
    when 'finance_pay' then r := kruispad.apply_finance_pay(t.request_id, t.recipient_id, 'email_link');
    when 'finance_decline' then r := kruispad.apply_finance_decline(t.request_id, t.recipient_id, p_reason, 'email_link');
    when 'print_document' then r := kruispad.apply_print_document(t.request_id, t.recipient_id, 'email_link');
    else raise exception 'validation: unknown action';
  end case;

  update kruispad.action_tokens set used_at = now() where id = t.id;

  -- Invalidate sibling unused tokens for the same request+recipient once acted.
  update kruispad.action_tokens
  set used_at = coalesce(used_at, now())
  where request_id = t.request_id
    and recipient_id = t.recipient_id
    and used_at is null
    and id <> t.id;

  return r;
end;
$$;

create or replace function kruispad.register_attachment(
  p_request_id uuid,
  p_storage_path text,
  p_file_name text,
  p_content_type text,
  p_byte_size bigint
)
returns kruispad.request_attachments
language plpgsql
security definer
set search_path = kruispad, public
as $$
declare
  r kruispad.payment_requests;
  a kruispad.request_attachments;
  v_role kruispad.app_role;
begin
  if p_content_type not in ('application/pdf', 'image/jpeg', 'image/png') then
    raise exception 'validation: only PDF, JPG, PNG allowed';
  end if;
  select * into r from kruispad.payment_requests where id = p_request_id for update;
  if not found then raise exception 'not_found'; end if;
  v_role := kruispad._role_of(auth.uid());
  if r.initiator_id <> auth.uid() and v_role <> 'admin' then raise exception 'forbidden'; end if;
  if r.status <> 'drafted' then raise exception 'invalid_state'; end if;

  insert into kruispad.request_attachments (
    request_id, storage_path, file_name, content_type, byte_size, uploaded_by
  ) values (
    p_request_id, p_storage_path, p_file_name, p_content_type, p_byte_size, auth.uid()
  ) returning * into a;

  perform kruispad.write_audit(p_request_id, auth.uid(), 'attach_file', 'drafted', 'drafted', null,
    jsonb_build_object('channel', 'app', 'file_name', p_file_name, 'content_type', p_content_type));
  return a;
end;
$$;

create or replace function kruispad.admin_set_role(p_user_id uuid, p_role kruispad.app_role)
returns kruispad.profiles
language plpgsql
security definer
set search_path = kruispad, public
as $$
declare
  p kruispad.profiles;
begin
  if not kruispad.is_admin() then raise exception 'forbidden'; end if;
  update kruispad.profiles set role = p_role, updated_at = now()
  where id = p_user_id returning * into p;
  if not found then raise exception 'not_found'; end if;
  return p;
end;
$$;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table kruispad.profiles enable row level security;
alter table kruispad.payment_requests enable row level security;
alter table kruispad.request_attachments enable row level security;
alter table kruispad.audit_events enable row level security;
alter table kruispad.action_tokens enable row level security;

drop policy if exists profiles_select_authenticated on kruispad.profiles;
create policy profiles_select_authenticated
  on kruispad.profiles for select to authenticated using (true);

drop policy if exists profiles_update_self on kruispad.profiles;
create policy profiles_update_self
  on kruispad.profiles for update to authenticated
  using (id = auth.uid() or kruispad.is_admin())
  with check (id = auth.uid() or kruispad.is_admin());

drop policy if exists payment_requests_select on kruispad.payment_requests;
create policy payment_requests_select
  on kruispad.payment_requests for select to authenticated
  using (
    kruispad.is_admin()
    or initiator_id = auth.uid()
    or (kruispad.current_role() = 'approver_fred' and status = 'submitted')
    or (kruispad.current_role() = 'approver_anton' and status = 'submitted')
    or (kruispad.current_role() = 'finance' and status in ('fully_approved', 'paid', 'document_printed'))
  );

drop policy if exists payment_requests_no_direct_insert on kruispad.payment_requests;
create policy payment_requests_no_direct_insert
  on kruispad.payment_requests for insert to authenticated with check (false);

drop policy if exists payment_requests_no_direct_update on kruispad.payment_requests;
create policy payment_requests_no_direct_update
  on kruispad.payment_requests for update to authenticated using (false);

drop policy if exists payment_requests_no_direct_delete on kruispad.payment_requests;
create policy payment_requests_no_direct_delete
  on kruispad.payment_requests for delete to authenticated using (false);

drop policy if exists attachments_select on kruispad.request_attachments;
create policy attachments_select
  on kruispad.request_attachments for select to authenticated
  using (
    exists (
      select 1 from kruispad.payment_requests pr
      where pr.id = request_id
        and (
          kruispad.is_admin()
          or pr.initiator_id = auth.uid()
          or (kruispad.current_role() = 'approver_fred' and pr.status = 'submitted')
          or (kruispad.current_role() = 'approver_anton' and pr.status = 'submitted')
          or (kruispad.current_role() = 'finance' and pr.status in ('fully_approved', 'paid', 'document_printed'))
        )
    )
  );

drop policy if exists attachments_no_direct_write on kruispad.request_attachments;
create policy attachments_no_direct_write
  on kruispad.request_attachments for insert to authenticated with check (false);

drop policy if exists attachments_no_direct_update on kruispad.request_attachments;
create policy attachments_no_direct_update
  on kruispad.request_attachments for update to authenticated using (false);

drop policy if exists attachments_no_direct_delete on kruispad.request_attachments;
create policy attachments_no_direct_delete
  on kruispad.request_attachments for delete to authenticated
  using (kruispad.is_admin() or uploaded_by = auth.uid());

drop policy if exists audit_select on kruispad.audit_events;
create policy audit_select
  on kruispad.audit_events for select to authenticated
  using (
    exists (
      select 1 from kruispad.payment_requests pr
      where pr.id = request_id
        and (
          kruispad.is_admin()
          or pr.initiator_id = auth.uid()
          or kruispad.current_role() in ('approver_fred', 'approver_anton', 'finance')
        )
    )
  );

drop policy if exists audit_no_direct_write on kruispad.audit_events;
create policy audit_no_direct_write
  on kruispad.audit_events for insert to authenticated with check (false);

-- Tokens: no direct client access (mint/peek/execute via SECURITY DEFINER only)
drop policy if exists action_tokens_deny_all on kruispad.action_tokens;
create policy action_tokens_deny_all
  on kruispad.action_tokens for all to authenticated using (false) with check (false);

-- ---------------------------------------------------------------------------
-- Storage bucket
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'kruispad-attachments',
  'kruispad-attachments',
  false,
  20971520,
  array['application/pdf', 'image/jpeg', 'image/png']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists storage_kruispad_attachments_select on storage.objects;
create policy storage_kruispad_attachments_select
  on storage.objects for select to authenticated
  using (
    bucket_id = 'kruispad-attachments'
    and (
      kruispad.is_admin()
      or (storage.foldername(name))[1] = auth.uid()::text
      or exists (
        select 1
        from kruispad.request_attachments ra
        join kruispad.payment_requests pr on pr.id = ra.request_id
        where ra.storage_path = name
          and (
            pr.initiator_id = auth.uid()
            or (kruispad.current_role() = 'approver_fred' and pr.status = 'submitted')
            or (kruispad.current_role() = 'approver_anton' and pr.status = 'submitted')
            or (kruispad.current_role() = 'finance' and pr.status in ('fully_approved', 'paid', 'document_printed'))
          )
      )
    )
  );

drop policy if exists storage_kruispad_attachments_insert on storage.objects;
create policy storage_kruispad_attachments_insert
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'kruispad-attachments'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists storage_kruispad_attachments_delete on storage.objects;
create policy storage_kruispad_attachments_delete
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'kruispad-attachments'
    and (kruispad.is_admin() or (storage.foldername(name))[1] = auth.uid()::text)
  );

-- Grants
grant usage on schema kruispad to anon, authenticated, service_role;
grant select on all tables in schema kruispad to authenticated;
grant execute on all functions in schema kruispad to authenticated;
grant execute on function kruispad.mint_action_token to service_role;
grant execute on function kruispad.peek_action_token to anon, authenticated, service_role;
grant execute on function kruispad.execute_email_action to anon, authenticated, service_role;

notify pgrst, 'reload schema';
