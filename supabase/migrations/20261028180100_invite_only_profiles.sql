-- Invite-only profiles + lock down profile email reads (GST-459 go-live).
-- Idempotent: safe if partially applied.

create table if not exists kruispad.invites (
  email text primary key,
  full_name text not null default '',
  role kruispad.app_role not null default 'initiator',
  invited_by uuid references kruispad.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  consumed_at timestamptz
);

alter table kruispad.invites enable row level security;

drop policy if exists invites_select_admin on kruispad.invites;
create policy invites_select_admin
  on kruispad.invites for select to authenticated
  using (kruispad.is_admin());

drop policy if exists invites_no_direct_write on kruispad.invites;
create policy invites_no_direct_write
  on kruispad.invites for all to authenticated
  using (false)
  with check (false);

-- Auto-create profile only when a pending invite exists for that email.
create or replace function kruispad.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = kruispad, public
as $$
declare
  inv kruispad.invites%rowtype;
  normalized text := lower(trim(coalesce(new.email, '')));
begin
  if normalized = '' then
    return new;
  end if;

  select * into inv
  from kruispad.invites
  where lower(email) = normalized
    and consumed_at is null
  for update;

  if not found then
    -- Invite-only: do not create a profile for unsolicited Auth users.
    return new;
  end if;

  insert into kruispad.profiles (id, email, full_name, role)
  values (
    new.id,
    normalized,
    coalesce(
      nullif(trim(inv.full_name), ''),
      new.raw_user_meta_data->>'full_name',
      split_part(normalized, '@', 1)
    ),
    inv.role
  )
  on conflict (id) do nothing;

  update kruispad.invites
  set consumed_at = now()
  where email = inv.email;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created_kruispad on auth.users;
create trigger on_auth_user_created_kruispad
  after insert on auth.users
  for each row execute function kruispad.handle_new_user();

-- Admin records an invite (email must later sign in with shouldCreateUser:false
-- after an Auth user is provisioned by an operator / Auth invite).
create or replace function kruispad.admin_invite_user(
  p_email text,
  p_full_name text default '',
  p_role kruispad.app_role default 'initiator'
)
returns kruispad.invites
language plpgsql
security definer
set search_path = kruispad, public
as $$
declare
  normalized text := lower(trim(coalesce(p_email, '')));
  row_out kruispad.invites;
begin
  if not kruispad.is_admin() then
    raise exception 'forbidden';
  end if;
  if normalized = '' or position('@' in normalized) = 0 then
    raise exception 'invalid_email';
  end if;

  insert into kruispad.invites (email, full_name, role, invited_by)
  values (
    normalized,
    coalesce(nullif(trim(p_full_name), ''), split_part(normalized, '@', 1)),
    p_role,
    auth.uid()
  )
  on conflict (email) do update
    set full_name = excluded.full_name,
        role = excluded.role,
        invited_by = excluded.invited_by,
        consumed_at = null,
        created_at = now()
  returning * into row_out;

  return row_out;
end;
$$;

revoke all on function kruispad.admin_invite_user(text, text, kruispad.app_role) from public, anon;
grant execute on function kruispad.admin_invite_user(text, text, kruispad.app_role) to authenticated;
grant execute on function kruispad.admin_invite_user(text, text, kruispad.app_role) to service_role;

grant select, insert, update, delete on table kruispad.invites to service_role;

-- Stop signed-in users from reading every profile email.
drop policy if exists profiles_select_authenticated on kruispad.profiles;
create policy profiles_select_own_or_admin
  on kruispad.profiles for select to authenticated
  using (id = auth.uid() or kruispad.is_admin());

notify pgrst, 'reload schema';
