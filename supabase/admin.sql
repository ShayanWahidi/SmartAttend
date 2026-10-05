-- =============================================================================
-- SmartAttend — ADMIN CONSOLE: RLS policies, grants and helper RPC
-- =============================================================================
-- Run this in the SQL Editor if your database was created from an older
-- schema.sql. It is idempotent and safe to run multiple times.
--
--   0. Make yourself admin (one-time, must be done in SQL — see the note below)
--   1. Admin writes on teachers / students / subjects / enrollments
--   2. Admin can list all profiles and change a user's role
--   3. admin_sync_user(): links a record to a login that already exists, so the
--      portal works whether the person signs up before or after being added
-- =============================================================================

-- =============================================================================
-- STEP 0 — bootstrap the FIRST admin (run this yourself, once)
-- =============================================================================
-- Do this AFTER signing up through the app with this email, otherwise it raises
-- 'Sign up ... first'. Replace the email below.
--
--   do $$
--   declare v_id uuid; v_email text := 'admin@college.edu';
--   begin
--     select id into v_id from auth.users where lower(email) = lower(v_email);
--     if v_id is null then
--       raise exception 'Sign up with % through the app first, then re-run.', v_email;
--     end if;
--     insert into public.profiles (id, role, full_name)
--     values (v_id, 'admin', 'Administrator')
--     on conflict (id) do update set role = 'admin';
--   end $$;
--
-- After that, every other admin can be created from the portal (Users tab).
-- Nobody can ever promote themselves through the app.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Teachers — read is already open to all signed-in users; writes are admin only
-- -----------------------------------------------------------------------------
drop policy if exists teachers_admin_insert on public.teachers;
create policy teachers_admin_insert on public.teachers
  for insert to authenticated with check (public.is_admin());

drop policy if exists teachers_admin_update on public.teachers;
create policy teachers_admin_update on public.teachers
  for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists teachers_admin_delete on public.teachers;
create policy teachers_admin_delete on public.teachers
  for delete to authenticated using (public.is_admin());

-- -----------------------------------------------------------------------------
-- 2. Students — admin may add/edit/remove students
-- -----------------------------------------------------------------------------
drop policy if exists students_admin_insert on public.students;
create policy students_admin_insert on public.students
  for insert to authenticated with check (public.is_admin());

drop policy if exists students_admin_update on public.students;
create policy students_admin_update on public.students
  for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists students_admin_delete on public.students;
create policy students_admin_delete on public.students
  for delete to authenticated using (public.is_admin());

-- -----------------------------------------------------------------------------
-- 3. Subjects — an admin may create any subject and reassign its teacher
--    (the existing teacher-owned policies stay in place; permissive policies are OR'd)
-- -----------------------------------------------------------------------------
drop policy if exists subjects_admin_insert on public.subjects;
create policy subjects_admin_insert on public.subjects
  for insert to authenticated with check (public.is_admin());

drop policy if exists subjects_admin_update on public.subjects;
create policy subjects_admin_update on public.subjects
  for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- -----------------------------------------------------------------------------
-- 4. Profiles — an admin may list every account and change a role.
--    Students/teachers keep their own self-only policies.
-- -----------------------------------------------------------------------------
drop policy if exists profiles_admin_select on public.profiles;
create policy profiles_admin_select on public.profiles
  for select to authenticated using (public.is_admin());

drop policy if exists profiles_admin_update on public.profiles;
create policy profiles_admin_update on public.profiles
  for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- -----------------------------------------------------------------------------
-- 5. Grants. Without these the policies are inert — Postgres checks table
--    privileges before policies.
-- -----------------------------------------------------------------------------
grant insert, update, delete on public.teachers, public.students to authenticated;
grant insert, update, delete on public.subjects    to authenticated;
grant insert, delete         on public.enrollments to authenticated;
grant update                 on public.profiles    to authenticated;

-- -----------------------------------------------------------------------------
-- 6. admin_sync_user(p_email, p_role, p_full_name)
--    Called by the portal right after adding a teacher/student record.
--    If that person already has a login, this links the record, sets the role,
--    and refuses to downgrade an existing admin. Returns the auth user id, or
--    NULL when they have not signed up yet (they get linked automatically by
--    the handle_new_auth_user trigger when they do).
-- -----------------------------------------------------------------------------
create or replace function public.admin_sync_user(
  p_email    text,
  p_role     public.app_role,
  p_full_name text
)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_id uuid;
begin
  if not public.is_admin() then
    raise exception 'not_authorised' using hint = 'Only admins can manage accounts.';
  end if;
  if p_role not in ('student', 'teacher') then
    raise exception 'bad_role' using hint = 'Use the Users tab to grant the admin role.';
  end if;

  select id into v_id from auth.users where lower(email) = lower(trim(p_email));
  if v_id is null then
    return null;                     -- no login yet; the trigger will link it later
  end if;

  insert into public.profiles (id, role, full_name)
  values (v_id, p_role, coalesce(nullif(trim(p_full_name), ''), split_part(p_email, '@', 1)))
  on conflict (id) do update
    -- never silently demote an existing admin
    set role      = case when public.profiles.role = 'admin' then 'admin' else excluded.role end,
        full_name = excluded.full_name;

  update public.students set auth_id = v_id
   where lower(email) = lower(trim(p_email)) and auth_id is distinct from v_id;
  update public.teachers set auth_id = v_id
   where lower(email) = lower(trim(p_email)) and auth_id is distinct from v_id;

  return v_id;
end;
$$;

revoke all on function public.admin_sync_user(text, public.app_role, text) from public;
grant execute on function public.admin_sync_user(text, public.app_role, text) to authenticated;