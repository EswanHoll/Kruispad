-- Kruispad Payment Request Approval Workflow
-- Enforces ADR-0002 parallel approval state machine server-side.

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
create type public.app_role as enum (
  'initiator',
  'approver_fred',
  'approver_anton',
  'finance',
  'admin'
);

create type public.request_status as enum (
  'drafted',
  'submitted',
  'fully_approved',
  'paid',
  'document_printed'
);

create type public.lane_status as enum ('pending', 'approved', 'declined');

create type public.payment_type as enum ('expense', 'maintenance', 'donation');

-- ---------------------------------------------------------------------------
-- Profiles (1:1 with auth.users)
-- ---------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null unique,
  full_name text not null default '',
  role public.app_role not null default 'initiator',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index profiles_role_idx on public.profiles (role);

-- ---------------------------------------------------------------------------
-- Payment requests
-- ---------------------------------------------------------------------------
create table public.payment_requests (
  id uuid primary key default gen_random_uuid(),
  initiator_id uuid not null references public.profiles (id),
  date_requested date not null default (timezone('Africa/Johannesburg', now()))::date,
  beneficiary_name text not null default '',
  payment_type public.payment_type not null default 'expense',
  description text not null default '',
  amount numeric(10, 2) not null default 0 check (amount >= 0),
  status public.request_status not null default 'drafted',
  fred_status public.lane_status not null default 'pending',
  fred_action_at timestamptz,
  fred_decline_reason text,
  anton_status public.lane_status not null default 'pending',
  anton_action_at timestamptz,
  anton_decline_reason text,
  finance_action_at timestamptz,
  finance_decline_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index payment_requests_status_idx on public.payment_requests (status);
create index payment_requests_initiator_idx on public.payment_requests (initiator_id);
create index payment_requests_fred_lane_idx on public.payment_requests (status, fred_status);
create index payment_requests_anton_lane_idx on public.payment_requests (status, anton_status);

-- ---------------------------------------------------------------------------
-- Attachments metadata (files in private storage bucket)
-- ---------------------------------------------------------------------------
create table public.request_attachments (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.payment_requests (id) on delete cascade,
  storage_path text not null unique,
  file_name text not null,
  content_type text not null,
  byte_size bigint not null check (byte_size > 0),
  uploaded_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now()
);

create index request_attachments_request_idx on public.request_attachments (request_id);

-- ---------------------------------------------------------------------------
-- Audit trail
-- ---------------------------------------------------------------------------
create table public.audit_events (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.payment_requests (id) on delete cascade,
  actor_id uuid references public.profiles (id),
  action text not null,
  from_status public.request_status,
  to_status public.request_status,
  reason text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index audit_events_request_idx on public.audit_events (request_id, created_at);

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
create or replace function public.current_role()
returns public.app_role
language sql
stable
security definer
set search_path = public
as $$
  select role from public.profiles where id = auth.uid();
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles where id = auth.uid() and role = 'admin'
  );
$$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name, role)
  values (
    new.id,
    coalesce(new.email, ''),
    coalesce(new.raw_user_meta_data->>'full_name', split_part(coalesce(new.email, ''), '@', 1)),
    'initiator'
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

create trigger payment_requests_updated_at
  before update on public.payment_requests
  for each row execute function public.set_updated_at();

create or replace function public.write_audit(
  p_request_id uuid,
  p_action text,
  p_from public.request_status,
  p_to public.request_status,
  p_reason text default null,
  p_payload jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.audit_events (request_id, actor_id, action, from_status, to_status, reason, payload)
  values (p_request_id, auth.uid(), p_action, p_from, p_to, p_reason, coalesce(p_payload, '{}'::jsonb));
end;
$$;

create or replace function public.reset_approval_lanes(r public.payment_requests)
returns public.payment_requests
language plpgsql
as $$
begin
  r.fred_status := 'pending';
  r.fred_action_at := null;
  r.fred_decline_reason := null;
  r.anton_status := 'pending';
  r.anton_action_at := null;
  r.anton_decline_reason := null;
  r.finance_action_at := null;
  r.finance_decline_reason := null;
  return r;
end;
$$;

-- ---------------------------------------------------------------------------
-- Transition RPCs
-- ---------------------------------------------------------------------------
create or replace function public.create_payment_request(
  p_date_requested date,
  p_beneficiary_name text,
  p_payment_type public.payment_type,
  p_description text,
  p_amount numeric
)
returns public.payment_requests
language plpgsql
security definer
set search_path = public
as $$
declare
  r public.payment_requests;
  v_role public.app_role;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;
  select role into v_role from public.profiles where id = auth.uid();
  if v_role not in ('initiator', 'admin') then
    raise exception 'forbidden';
  end if;

  insert into public.payment_requests (
    initiator_id, date_requested, beneficiary_name, payment_type, description, amount, status
  ) values (
    auth.uid(), p_date_requested, coalesce(p_beneficiary_name, ''), p_payment_type,
    coalesce(p_description, ''), coalesce(p_amount, 0), 'drafted'
  )
  returning * into r;

  perform public.write_audit(r.id, 'create_draft', null, 'drafted', null, jsonb_build_object('amount', r.amount));
  return r;
end;
$$;

create or replace function public.save_payment_request(
  p_id uuid,
  p_date_requested date,
  p_beneficiary_name text,
  p_payment_type public.payment_type,
  p_description text,
  p_amount numeric
)
returns public.payment_requests
language plpgsql
security definer
set search_path = public
as $$
declare
  r public.payment_requests;
  v_role public.app_role;
begin
  select * into r from public.payment_requests where id = p_id for update;
  if not found then
    raise exception 'not_found';
  end if;
  select role into v_role from public.profiles where id = auth.uid();
  if r.initiator_id <> auth.uid() and v_role <> 'admin' then
    raise exception 'forbidden';
  end if;
  if r.status <> 'drafted' then
    raise exception 'invalid_state: only drafted requests are editable';
  end if;

  update public.payment_requests set
    date_requested = p_date_requested,
    beneficiary_name = coalesce(p_beneficiary_name, ''),
    payment_type = p_payment_type,
    description = coalesce(p_description, ''),
    amount = coalesce(p_amount, 0),
    updated_at = now()
  where id = p_id
  returning * into r;

  perform public.write_audit(r.id, 'save_draft', 'drafted', 'drafted', null, '{}'::jsonb);
  return r;
end;
$$;

create or replace function public.submit_payment_request(p_id uuid)
returns public.payment_requests
language plpgsql
security definer
set search_path = public
as $$
declare
  r public.payment_requests;
  v_role public.app_role;
  v_attachments int;
begin
  select * into r from public.payment_requests where id = p_id for update;
  if not found then
    raise exception 'not_found';
  end if;
  select role into v_role from public.profiles where id = auth.uid();
  if r.initiator_id <> auth.uid() and v_role <> 'admin' then
    raise exception 'forbidden';
  end if;
  if r.status <> 'drafted' then
    raise exception 'invalid_state: must be drafted';
  end if;
  if length(trim(r.beneficiary_name)) = 0 then
    raise exception 'validation: beneficiary_name required';
  end if;
  if length(trim(r.description)) = 0 then
    raise exception 'validation: description required';
  end if;
  if r.amount <= 0 then
    raise exception 'validation: amount must be positive';
  end if;
  select count(*) into v_attachments from public.request_attachments where request_id = p_id;
  if v_attachments < 1 then
    raise exception 'validation: at least one attachment required';
  end if;

  update public.payment_requests set
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

  perform public.write_audit(r.id, 'submit', 'drafted', 'submitted', null, '{}'::jsonb);
  return r;
end;
$$;

create or replace function public.fred_approve(p_id uuid)
returns public.payment_requests
language plpgsql
security definer
set search_path = public
as $$
declare
  r public.payment_requests;
  v_role public.app_role;
  v_from public.request_status;
  v_to public.request_status;
  v_action text;
begin
  select * into r from public.payment_requests where id = p_id for update;
  if not found then raise exception 'not_found'; end if;
  select role into v_role from public.profiles where id = auth.uid();
  if v_role not in ('approver_fred', 'admin') then raise exception 'forbidden'; end if;
  if r.status <> 'submitted' then raise exception 'invalid_state'; end if;
  if r.fred_status <> 'pending' then raise exception 'conflict: fred already acted'; end if;

  v_from := r.status;
  if r.anton_status = 'approved' then
    v_to := 'fully_approved';
    v_action := 'fred_approve_fully';
  else
    v_to := 'submitted';
    v_action := 'fred_approve';
  end if;

  update public.payment_requests set
    fred_status = 'approved',
    fred_action_at = now(),
    fred_decline_reason = null,
    status = v_to,
    updated_at = now()
  where id = p_id
  returning * into r;

  perform public.write_audit(r.id, v_action, v_from, v_to, null, '{}'::jsonb);
  return r;
end;
$$;

create or replace function public.fred_decline(p_id uuid, p_reason text)
returns public.payment_requests
language plpgsql
security definer
set search_path = public
as $$
declare
  r public.payment_requests;
  v_role public.app_role;
begin
  if p_reason is null or length(trim(p_reason)) = 0 then
    raise exception 'validation: decline reason required';
  end if;
  select * into r from public.payment_requests where id = p_id for update;
  if not found then raise exception 'not_found'; end if;
  select role into v_role from public.profiles where id = auth.uid();
  if v_role not in ('approver_fred', 'admin') then raise exception 'forbidden'; end if;
  if r.status <> 'submitted' then raise exception 'invalid_state'; end if;

  update public.payment_requests set
    status = 'drafted',
    fred_status = 'pending',
    fred_action_at = null,
    fred_decline_reason = null,
    anton_status = 'pending',
    anton_action_at = null,
    anton_decline_reason = null,
    finance_action_at = null,
    finance_decline_reason = null,
    updated_at = now()
  where id = p_id
  returning * into r;

  perform public.write_audit(r.id, 'fred_decline', 'submitted', 'drafted', trim(p_reason), '{}'::jsonb);
  return r;
end;
$$;

create or replace function public.anton_approve(p_id uuid)
returns public.payment_requests
language plpgsql
security definer
set search_path = public
as $$
declare
  r public.payment_requests;
  v_role public.app_role;
  v_from public.request_status;
  v_to public.request_status;
  v_action text;
begin
  select * into r from public.payment_requests where id = p_id for update;
  if not found then raise exception 'not_found'; end if;
  select role into v_role from public.profiles where id = auth.uid();
  if v_role not in ('approver_anton', 'admin') then raise exception 'forbidden'; end if;
  if r.status <> 'submitted' then raise exception 'invalid_state'; end if;
  if r.anton_status <> 'pending' then raise exception 'conflict: anton already acted'; end if;

  v_from := r.status;
  if r.fred_status = 'approved' then
    v_to := 'fully_approved';
    v_action := 'anton_approve_fully';
  else
    v_to := 'submitted';
    v_action := 'anton_approve';
  end if;

  update public.payment_requests set
    anton_status = 'approved',
    anton_action_at = now(),
    anton_decline_reason = null,
    status = v_to,
    updated_at = now()
  where id = p_id
  returning * into r;

  perform public.write_audit(r.id, v_action, v_from, v_to, null, '{}'::jsonb);
  return r;
end;
$$;

create or replace function public.anton_decline(p_id uuid, p_reason text)
returns public.payment_requests
language plpgsql
security definer
set search_path = public
as $$
declare
  r public.payment_requests;
  v_role public.app_role;
begin
  if p_reason is null or length(trim(p_reason)) = 0 then
    raise exception 'validation: decline reason required';
  end if;
  select * into r from public.payment_requests where id = p_id for update;
  if not found then raise exception 'not_found'; end if;
  select role into v_role from public.profiles where id = auth.uid();
  if v_role not in ('approver_anton', 'admin') then raise exception 'forbidden'; end if;
  if r.status <> 'submitted' then raise exception 'invalid_state'; end if;

  update public.payment_requests set
    status = 'drafted',
    fred_status = 'pending',
    fred_action_at = null,
    fred_decline_reason = null,
    anton_status = 'pending',
    anton_action_at = null,
    anton_decline_reason = null,
    finance_action_at = null,
    finance_decline_reason = null,
    updated_at = now()
  where id = p_id
  returning * into r;

  perform public.write_audit(r.id, 'anton_decline', 'submitted', 'drafted', trim(p_reason), '{}'::jsonb);
  return r;
end;
$$;

create or replace function public.finance_pay(p_id uuid)
returns public.payment_requests
language plpgsql
security definer
set search_path = public
as $$
declare
  r public.payment_requests;
  v_role public.app_role;
begin
  select * into r from public.payment_requests where id = p_id for update;
  if not found then raise exception 'not_found'; end if;
  select role into v_role from public.profiles where id = auth.uid();
  if v_role not in ('finance', 'admin') then raise exception 'forbidden'; end if;
  if r.status <> 'fully_approved' then raise exception 'invalid_state'; end if;

  update public.payment_requests set
    status = 'paid',
    finance_action_at = now(),
    finance_decline_reason = null,
    updated_at = now()
  where id = p_id
  returning * into r;

  perform public.write_audit(r.id, 'finance_pay', 'fully_approved', 'paid', null, '{}'::jsonb);
  return r;
end;
$$;

create or replace function public.finance_decline(p_id uuid, p_reason text)
returns public.payment_requests
language plpgsql
security definer
set search_path = public
as $$
declare
  r public.payment_requests;
  v_role public.app_role;
begin
  if p_reason is null or length(trim(p_reason)) = 0 then
    raise exception 'validation: decline reason required';
  end if;
  select * into r from public.payment_requests where id = p_id for update;
  if not found then raise exception 'not_found'; end if;
  select role into v_role from public.profiles where id = auth.uid();
  if v_role not in ('finance', 'admin') then raise exception 'forbidden'; end if;
  if r.status <> 'fully_approved' then raise exception 'invalid_state'; end if;

  update public.payment_requests set
    status = 'drafted',
    fred_status = 'pending',
    fred_action_at = null,
    fred_decline_reason = null,
    anton_status = 'pending',
    anton_action_at = null,
    anton_decline_reason = null,
    finance_action_at = null,
    finance_decline_reason = null,
    updated_at = now()
  where id = p_id
  returning * into r;

  perform public.write_audit(r.id, 'finance_decline', 'fully_approved', 'drafted', trim(p_reason), '{}'::jsonb);
  return r;
end;
$$;

create or replace function public.print_document(p_id uuid)
returns public.payment_requests
language plpgsql
security definer
set search_path = public
as $$
declare
  r public.payment_requests;
  v_role public.app_role;
begin
  select * into r from public.payment_requests where id = p_id for update;
  if not found then raise exception 'not_found'; end if;
  select role into v_role from public.profiles where id = auth.uid();
  if v_role <> 'admin' then raise exception 'forbidden'; end if;
  if r.status <> 'paid' then raise exception 'invalid_state'; end if;

  update public.payment_requests set
    status = 'document_printed',
    updated_at = now()
  where id = p_id
  returning * into r;

  perform public.write_audit(r.id, 'print_document', 'paid', 'document_printed', null, '{}'::jsonb);
  return r;
end;
$$;

create or replace function public.register_attachment(
  p_request_id uuid,
  p_storage_path text,
  p_file_name text,
  p_content_type text,
  p_byte_size bigint
)
returns public.request_attachments
language plpgsql
security definer
set search_path = public
as $$
declare
  r public.payment_requests;
  a public.request_attachments;
  v_role public.app_role;
begin
  if p_content_type not in ('application/pdf', 'image/jpeg', 'image/png') then
    raise exception 'validation: only PDF, JPG, PNG allowed';
  end if;
  select * into r from public.payment_requests where id = p_request_id for update;
  if not found then raise exception 'not_found'; end if;
  select role into v_role from public.profiles where id = auth.uid();
  if r.initiator_id <> auth.uid() and v_role <> 'admin' then raise exception 'forbidden'; end if;
  if r.status <> 'drafted' then raise exception 'invalid_state'; end if;

  insert into public.request_attachments (
    request_id, storage_path, file_name, content_type, byte_size, uploaded_by
  ) values (
    p_request_id, p_storage_path, p_file_name, p_content_type, p_byte_size, auth.uid()
  )
  returning * into a;

  perform public.write_audit(
    p_request_id, 'attach_file', 'drafted', 'drafted', null,
    jsonb_build_object('file_name', p_file_name, 'content_type', p_content_type)
  );
  return a;
end;
$$;

create or replace function public.admin_set_role(p_user_id uuid, p_role public.app_role)
returns public.profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  p public.profiles;
begin
  if not public.is_admin() then
    raise exception 'forbidden';
  end if;
  update public.profiles set role = p_role, updated_at = now()
  where id = p_user_id
  returning * into p;
  if not found then raise exception 'not_found'; end if;
  return p;
end;
$$;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.payment_requests enable row level security;
alter table public.request_attachments enable row level security;
alter table public.audit_events enable row level security;

create policy profiles_select_authenticated
  on public.profiles for select to authenticated
  using (true);

create policy profiles_update_self
  on public.profiles for update to authenticated
  using (id = auth.uid() or public.is_admin())
  with check (id = auth.uid() or public.is_admin());

create policy payment_requests_select
  on public.payment_requests for select to authenticated
  using (
    public.is_admin()
    or initiator_id = auth.uid()
    or (
      public.current_role() = 'approver_fred'
      and status = 'submitted'
    )
    or (
      public.current_role() = 'approver_anton'
      and status = 'submitted'
    )
    or (
      public.current_role() = 'finance'
      and status in ('fully_approved', 'paid', 'document_printed')
    )
  );

-- Mutations go through SECURITY DEFINER RPCs; block direct status writes.
create policy payment_requests_no_direct_insert
  on public.payment_requests for insert to authenticated
  with check (false);

create policy payment_requests_no_direct_update
  on public.payment_requests for update to authenticated
  using (false);

create policy payment_requests_no_direct_delete
  on public.payment_requests for delete to authenticated
  using (false);

create policy attachments_select
  on public.request_attachments for select to authenticated
  using (
    exists (
      select 1 from public.payment_requests pr
      where pr.id = request_id
        and (
          public.is_admin()
          or pr.initiator_id = auth.uid()
          or (public.current_role() = 'approver_fred' and pr.status = 'submitted')
          or (public.current_role() = 'approver_anton' and pr.status = 'submitted')
          or (public.current_role() = 'finance' and pr.status in ('fully_approved', 'paid', 'document_printed'))
        )
    )
  );

create policy attachments_no_direct_write
  on public.request_attachments for insert to authenticated
  with check (false);

create policy attachments_no_direct_update
  on public.request_attachments for update to authenticated
  using (false);

create policy attachments_no_direct_delete
  on public.request_attachments for delete to authenticated
  using (public.is_admin() or uploaded_by = auth.uid());

create policy audit_select
  on public.audit_events for select to authenticated
  using (
    exists (
      select 1 from public.payment_requests pr
      where pr.id = request_id
        and (
          public.is_admin()
          or pr.initiator_id = auth.uid()
          or public.current_role() in ('approver_fred', 'approver_anton', 'finance')
        )
    )
  );

create policy audit_no_direct_write
  on public.audit_events for insert to authenticated
  with check (false);

-- ---------------------------------------------------------------------------
-- Storage: private bucket payment-attachments
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'payment-attachments',
  'payment-attachments',
  false,
  20971520,
  array['application/pdf', 'image/jpeg', 'image/png']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy storage_attachments_select
  on storage.objects for select to authenticated
  using (
    bucket_id = 'payment-attachments'
    and (
      public.is_admin()
      or (storage.foldername(name))[1] = auth.uid()::text
      or exists (
        select 1
        from public.request_attachments ra
        join public.payment_requests pr on pr.id = ra.request_id
        where ra.storage_path = name
          and (
            pr.initiator_id = auth.uid()
            or (public.current_role() = 'approver_fred' and pr.status = 'submitted')
            or (public.current_role() = 'approver_anton' and pr.status = 'submitted')
            or (public.current_role() = 'finance' and pr.status in ('fully_approved', 'paid', 'document_printed'))
          )
      )
    )
  );

create policy storage_attachments_insert
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'payment-attachments'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy storage_attachments_delete
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'payment-attachments'
    and (
      public.is_admin()
      or (storage.foldername(name))[1] = auth.uid()::text
    )
  );

grant usage on schema public to authenticated;
grant select on all tables in schema public to authenticated;
grant execute on function public.create_payment_request to authenticated;
grant execute on function public.save_payment_request to authenticated;
grant execute on function public.submit_payment_request to authenticated;
grant execute on function public.fred_approve to authenticated;
grant execute on function public.fred_decline to authenticated;
grant execute on function public.anton_approve to authenticated;
grant execute on function public.anton_decline to authenticated;
grant execute on function public.finance_pay to authenticated;
grant execute on function public.finance_decline to authenticated;
grant execute on function public.print_document to authenticated;
grant execute on function public.register_attachment to authenticated;
grant execute on function public.admin_set_role to authenticated;
grant execute on function public.current_role to authenticated;
grant execute on function public.is_admin to authenticated;
