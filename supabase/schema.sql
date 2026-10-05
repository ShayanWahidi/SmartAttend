-- =============================================================================
-- SmartAttend — Database Schema, Row Level Security & RPC functions
-- =============================================================================
-- HOW TO RUN
--   Supabase Dashboard > SQL Editor > New query > paste this whole file > Run
--   (Safe to run more than once — every statement is idempotent.)
--
-- Tables
--   profiles            role + display name, 1:1 with auth.users
--   students            student records (roll_no, email) linked to auth.users
--   teachers            teacher records linked to auth.users
--   subjects            a subject is owned by exactly one teacher
--   enrollments         which students are in which subject (class roster)
--   attendance_sessions a class period: holds the temporary QR token
--   attendance          one row per student per session (present/absent/late)
--
-- All attendance marking goes through the mark_attendance() RPC so that
-- expiry / closed-session / duplicate checks are enforced by the database
-- and can never be bypassed from the browser.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Extensions & enums
-- -----------------------------------------------------------------------------
create extension if not exists pgcrypto;

do $$ begin
  create type public.app_role as enum ('student', 'teacher', 'admin');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.session_status as enum ('active', 'closed');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.attend_status as enum ('present', 'absent', 'late');
exception when duplicate_object then null; end $$;

-- -----------------------------------------------------------------------------
-- 2. Tables
-- -----------------------------------------------------------------------------
create table if not exists public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  role        public.app_role    not null default 'student',
  full_name   text               not null,
  created_at  timestamptz        not null default now()
);

create table if not exists public.students (
  id          uuid primary key default gen_random_uuid(),
  auth_id     uuid unique references auth.users (id) on delete set null,
  name        text        not null,
  roll_no     text        not null unique,
  email       text        not null unique,
  created_at  timestamptz not null default now()
);

create table if not exists public.teachers (
  id          uuid primary key default gen_random_uuid(),
  auth_id     uuid unique references auth.users (id) on delete set null,
  name        text        not null,
  email       text        not null unique,
  created_at  timestamptz not null default now()
);

create table if not exists public.subjects (
  id          uuid primary key default gen_random_uuid(),
  name        text        not null,
  code        text        unique,
  teacher_id  uuid references public.teachers (id) on delete set null,
  created_at  timestamptz not null default now()
);

-- Class roster: needed to know the total strength of a class (for "Absent" count)
-- and which students are allowed to mark attendance for a subject.
create table if not exists public.enrollments (
  id          uuid primary key default gen_random_uuid(),
  subject_id  uuid not null references public.subjects (id) on delete cascade,
  student_id  uuid not null references public.students (id) on delete cascade,
  created_at  timestamptz not null default now(),
  unique (subject_id, student_id)
);

create table if not exists public.attendance_sessions (
  id                  uuid primary key default gen_random_uuid(),
  subject_id          uuid not null references public.subjects (id) on delete cascade,
  teacher_id          uuid not null references public.teachers (id) on delete cascade,
  token               text        not null unique,
  status              public.session_status not null default 'active',
  qr_duration_seconds integer     not null default 120 check (qr_duration_seconds between 30 and 3600),
  session_date        date        not null default current_date,
  created_at          timestamptz not null default now(),
  expires_at          timestamptz not null,
  closed_at           timestamptz
);

create table if not exists public.attendance (
  id          uuid primary key default gen_random_uuid(),
  student_id  uuid not null references public.students (id) on delete cascade,
  subject_id  uuid not null references public.subjects (id) on delete cascade,
  session_id  uuid not null references public.attendance_sessions (id) on delete cascade,
  status      public.attend_status not null default 'present',
  marked_at   timestamptz not null default now(),
  unique (student_id, session_id)
);

-- Only one live QR per subject at a time.
create unique index if not exists one_active_session_per_subject
  on public.attendance_sessions (subject_id) where status = 'active';

create index if not exists attendance_subject_date_idx  on public.attendance (subject_id, marked_at desc);
create index if not exists attendance_session_idx        on public.attendance (session_id);
create index if not exists attendance_student_idx        on public.attendance (student_id, marked_at desc);
create index if not exists sessions_subject_created_idx  on public.attendance_sessions (subject_id, created_at desc);
create index if not exists enrollments_subject_idx      on public.enrollments (subject_id);

-- -----------------------------------------------------------------------------
-- 3. Helper functions (SECURITY DEFINER so RLS on profiles can't recurse)
-- -----------------------------------------------------------------------------
create or replace function public.current_role()
returns public.app_role
language sql stable security definer set search_path = public
as $$
  select role from public.profiles where id = auth.uid();
$$;

create or replace function public.current_student_id()
returns uuid
language sql stable security definer set search_path = public
as $$
  select s.id from public.students s where s.auth_id = auth.uid();
$$;

create or replace function public.current_teacher_id()
returns uuid
language sql stable security definer set search_path = public
as $$
  select t.id from public.teachers t where t.auth_id = auth.uid();
$$;

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public
as $$ select coalesce(public.current_role() = 'admin', false); $$;

create or replace function public.owns_subject(p_subject_id uuid)
returns boolean language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.subjects s
    where s.id = p_subject_id and s.teacher_id = public.current_teacher_id()
  );
$$;

revoke all on function public.current_role()              from public;
revoke all on function public.current_student_id()         from public;
revoke all on function public.current_teacher_id()         from public;
revoke all on function public.is_admin()                  from public;
revoke all on function public.owns_subject(uuid)          from public;

-- -----------------------------------------------------------------------------
-- 4. Row Level Security
-- -----------------------------------------------------------------------------
alter table public.profiles           enable row level security;
alter table public.students           enable row level security;
alter table public.teachers           enable row level security;
alter table public.subjects           enable row level security;
alter table public.enrollments        enable row level security;
alter table public.attendance_sessions enable row level security;
alter table public.attendance         enable row level security;

-- profiles: a user may read/update only their own profile
drop policy if exists profiles_select_self on public.profiles;
create policy profiles_select_self on public.profiles
  for select to authenticated using (id = auth.uid());
drop policy if exists profiles_update_self on public.profiles;
create policy profiles_update_self on public.profiles
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

-- students: own record, or any teacher of a subject the student is enrolled in
drop policy if exists students_select on public.students;
create policy students_select on public.students
  for select to authenticated using (
    auth_id = auth.uid()
    or public.is_admin()
    or exists (
      select 1 from public.enrollments e
      join public.subjects s on s.id = e.subject_id
      where e.student_id = students.id and s.teacher_id = public.current_teacher_id()
    )
  );

-- teachers: everyone signed in can see the teacher list (used for the admin panel
-- and to display "taken by" info). Writes are admin-only, done via SQL.
drop policy if exists teachers_select on public.teachers;
create policy teachers_select on public.teachers
  for select to authenticated using (true);

-- subjects: readable by any signed-in user, writable by the owning teacher
drop policy if exists subjects_select on public.subjects;
create policy subjects_select on public.subjects
  for select to authenticated using (true);
drop policy if exists subjects_insert on public.subjects;
create policy subjects_insert on public.subjects
  for insert to authenticated with check (teacher_id = public.current_teacher_id());
drop policy if exists subjects_update on public.subjects;
create policy subjects_update on public.subjects
  for update to authenticated using (teacher_id = public.current_teacher_id())
  with check (teacher_id = public.current_teacher_id());
drop policy if exists subjects_delete on public.subjects;
create policy subjects_delete on public.subjects
  for delete to authenticated using (teacher_id = public.current_teacher_id() or public.is_admin());

-- enrollments: visible to the student and to the subject's teacher
drop policy if exists enrollments_select on public.enrollments;
create policy enrollments_select on public.enrollments
  for select to authenticated using (
    student_id = public.current_student_id()
    or public.owns_subject(subject_id)
    or public.is_admin()
  );
drop policy if exists enrollments_insert on public.enrollments;
create policy enrollments_insert on public.enrollments
  for insert to authenticated with check (public.owns_subject(subject_id) or public.is_admin());
drop policy if exists enrollments_delete on public.enrollments;
create policy enrollments_delete on public.enrollments
  for delete to authenticated using (public.owns_subject(subject_id) or public.is_admin());

-- attendance_sessions: readable by any signed-in user (a student must be able to
-- look up the token they just scanned). Only the owning teacher can create/close.
drop policy if exists sessions_select on public.attendance_sessions;
create policy sessions_select on public.attendance_sessions
  for select to authenticated using (true);
drop policy if exists sessions_insert on public.attendance_sessions;
create policy sessions_insert on public.attendance_sessions
  for insert to authenticated with check (teacher_id = public.current_teacher_id());
drop policy if exists sessions_update on public.attendance_sessions;
create policy sessions_update on public.attendance_sessions
  for update to authenticated using (teacher_id = public.current_teacher_id())
  with check (teacher_id = public.current_teacher_id());

-- attendance: students read their own rows, teachers read rows for their subjects.
-- INSERT is intentionally NOT granted: attendance can only be written through
-- mark_attendance(), which performs all validation inside the database.
drop policy if exists attendance_select on public.attendance;
create policy attendance_select on public.attendance
  for select to authenticated using (
    student_id = public.current_student_id()
    or public.owns_subject(subject_id)
    or public.is_admin()
  );

-- -----------------------------------------------------------------------------
-- 5. RPC: teacher starts a session (generates the temporary QR token)
-- -----------------------------------------------------------------------------
create or replace function public.start_attendance_session(
  p_subject_id        uuid,
  p_duration_seconds  integer default 120
)
returns public.attendance_sessions
language plpgsql
-- `extensions` is required: gen_random_bytes() ships with pgcrypto, which
-- Supabase installs into the `extensions` schema, not `public`. Without it,
-- every call raises 42883 "function gen_random_bytes(integer) does not exist".
-- (gen_random_uuid() is different — it is in pg_catalog, so the table defaults
-- work without this.)
security definer set search_path = public, extensions
as $$
declare
  v_duration integer := greatest(30, least(coalesce(p_duration_seconds, 120), 3600));
  v_teacher  uuid := public.current_teacher_id();
  v_subject  public.subjects;
  v_session  public.attendance_sessions;
begin
  if v_teacher is null then
    raise exception 'not_a_teacher' using hint = 'Only teachers can start an attendance session.';
  end if;

  select * into v_subject from public.subjects where id = p_subject_id;
  if not found then
    raise exception 'subject_not_found';
  end if;
  if v_subject.teacher_id is distinct from v_teacher then
    raise exception 'not_subject_teacher' using hint = 'You are not assigned to this subject.';
  end if;

  -- Auto-close a previous session whose QR has already expired, otherwise the
  -- one-active-session-per-subject index below would reject the new row.
  update public.attendance_sessions
     set status = 'closed', closed_at = coalesce(closed_at, now())
   where subject_id = p_subject_id and status = 'active' and expires_at <= now();

  if exists (
    select 1 from public.attendance_sessions
    where subject_id = p_subject_id and status = 'active'
  ) then
    raise exception 'session_already_active'
      using hint = 'An attendance session is already running for this subject. End it first.';
  end if;

  insert into public.attendance_sessions (
    subject_id, teacher_id, token, status, qr_duration_seconds, expires_at
  ) values (
    p_subject_id,
    v_teacher,
    upper(encode(gen_random_bytes(6), 'hex')),
    'active',
    v_duration,
    now() + make_interval(secs => v_duration)
  )
  returning * into v_session;

  return v_session;
end;
$$;

-- -----------------------------------------------------------------------------
-- 6. RPC: teacher closes a session
-- -----------------------------------------------------------------------------
create or replace function public.end_attendance_session(p_session_id uuid)
returns public.attendance_sessions
language plpgsql security definer set search_path = public
as $$
declare
  v_session public.attendance_sessions;
begin
  update public.attendance_sessions
     set status = 'closed', closed_at = coalesce(closed_at, now())
   where id = p_session_id and teacher_id = public.current_teacher_id()
  returning * into v_session;

  if not found then
    raise exception 'session_not_found_or_not_owner';
  end if;
  return v_session;
end;
$$;

-- -----------------------------------------------------------------------------
-- 7. RPC: student marks attendance by scanning the QR token  (PRD §9)
--    Returns { ok, code, message, ... } instead of raising, so the UI can show
--    the exact validation message from the PRD.
--      not_logged_in | forbidden | not_registered | invalid_qr |
--      session_closed | expired | not_enrolled | already_marked | marked
-- -----------------------------------------------------------------------------
create or replace function public.mark_attendance(p_token text)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_role    public.app_role;
  v_student uuid;
  v_session public.attendance_sessions;
  v_subject text;
  v_row     public.attendance;
begin
  select role into v_role from public.profiles where id = auth.uid();
  if v_role is null then
    return jsonb_build_object('ok', false, 'code', 'not_logged_in',
      'message', 'Please log in first.');
  end if;
  if v_role <> 'student' then
    return jsonb_build_object('ok', false, 'code', 'forbidden',
      'message', 'Only students can mark attendance.');
  end if;

  select id into v_student from public.students where auth_id = auth.uid();
  if v_student is null then
    return jsonb_build_object('ok', false, 'code', 'not_registered',
      'message', 'Your login is not linked to a student record. Contact your admin.');
  end if;

  select * into v_session from public.attendance_sessions where token = upper(trim(p_token));
  if not found or v_session is null then
    return jsonb_build_object('ok', false, 'code', 'invalid_qr',
      'message', 'This QR code is not valid.');
  end if;
  if v_session.status <> 'active' then
    return jsonb_build_object('ok', false, 'code', 'session_closed',
      'message', 'Attendance session is closed.');
  end if;
  if v_session.expires_at <= now() then
    return jsonb_build_object('ok', false, 'code', 'expired',
      'message', 'QR code expired.');
  end if;
  if not exists (
    select 1 from public.enrollments
    where subject_id = v_session.subject_id and student_id = v_student
  ) then
    return jsonb_build_object('ok', false, 'code', 'not_enrolled',
      'message', 'You are not enrolled in this subject.');
  end if;

  select name into v_subject from public.subjects where id = v_session.subject_id;

  insert into public.attendance (student_id, subject_id, session_id, status)
  values (v_student, v_session.subject_id, v_session.id, 'present')
  on conflict (student_id, session_id) do nothing
  returning * into v_row;

  if v_row.id is null then
    return jsonb_build_object('ok', false, 'code', 'already_marked',
      'message', 'Attendance already recorded.', 'subject', v_subject);
  end if;

  return jsonb_build_object(
    'ok', true, 'code', 'marked',
    'message', 'Attendance marked successfully',
    'subject', v_subject,
    'marked_at', v_row.marked_at,
    'subject_id', v_row.subject_id);
end;
$$;

-- -----------------------------------------------------------------------------
-- 8. RPC: student's dashboard numbers (overall + subject wise, PRD §11)
-- -----------------------------------------------------------------------------
create or replace function public.my_attendance_summary()
returns table (
  subject_id    uuid,
  subject_name  text,
  subject_code  text,
  present_count bigint,
  total_classes bigint,
  percentage    numeric
)
language sql stable security definer set search_path = public
as $$
  with me as (select public.current_student_id() as student_id),
  my_subjects as (
    select s.id, s.name, s.code
    from public.subjects s
    join public.enrollments e on e.subject_id = s.id
    where e.student_id = (select student_id from me)
  ),
  totals as (
    select s.id as subject_id, count(se.id) as total_classes
    from public.subjects s
    left join public.attendance_sessions se on se.subject_id = s.id
    group by s.id
  )
  select
    ms.id,
    ms.name,
    ms.code,
    (select count(*) from public.attendance a
      where a.subject_id = ms.id and a.student_id = (select student_id from me)
        and a.status in ('present', 'late')) as present_count,
    coalesce(t.total_classes, 0) as total_classes,
    case when coalesce(t.total_classes, 0) = 0 then 0
         else round(
           (select count(*) from public.attendance a
             where a.subject_id = ms.id and a.student_id = (select student_id from me)
               and a.status in ('present', 'late'))::numeric
           / t.total_classes * 100, 1)
    end as percentage
  from my_subjects ms
  left join totals t on t.subject_id = ms.id
  order by ms.name;
$$;

-- -----------------------------------------------------------------------------
-- 9. RPC: student's attendance history
-- -----------------------------------------------------------------------------
create or replace function public.my_attendance_records()
returns table (
  id           uuid,
  subject_id   uuid,
  subject_name text,
  subject_code text,
  status       text,
  marked_at    timestamptz
)
language sql stable security definer set search_path = public
as $$
  select a.id, a.subject_id, s.name, s.code, a.status::text, a.marked_at
  from public.attendance a
  join public.subjects s on s.id = a.subject_id
  where a.student_id = public.current_student_id()
  order by a.marked_at desc
  limit 500;
$$;

-- -----------------------------------------------------------------------------
-- 10. RPC: teacher's live roster for a session (present + absent)
-- -----------------------------------------------------------------------------
create or replace function public.session_roster(p_session_id uuid)
returns table (
  student_id uuid,
  name       text,
  roll_no    text,
  status     text,
  marked_at  timestamptz
)
language plpgsql stable security definer set search_path = public
as $$
declare
  v_subject uuid;
begin
  select se.subject_id into v_subject
    from public.attendance_sessions se where se.id = p_session_id;

  if v_subject is null or not (public.owns_subject(v_subject) or public.is_admin()) then
    raise exception 'not_authorised';
  end if;

  return query
    select st.id, st.name, st.roll_no,
           coalesce(a.status::text, 'absent'), a.marked_at
    from public.enrollments e
    join public.students st on st.id = e.student_id
    left join public.attendance a
           on a.student_id = st.id and a.session_id = p_session_id
    where e.subject_id = v_subject
    order by st.roll_no;
end;
$$;

-- -----------------------------------------------------------------------------
-- 11. RPC: teacher's subject report (for the CSV export, PRD §4)
-- -----------------------------------------------------------------------------
create or replace function public.subject_attendance_report(p_subject_id uuid)
returns table (
  student_id uuid,
  name       text,
  roll_no    text,
  session_id uuid,
  session_date date,
  status     text,
  marked_at  timestamptz
)
language plpgsql stable security definer set search_path = public
as $$
begin
  if not (public.owns_subject(p_subject_id) or public.is_admin()) then
    raise exception 'not_authorised';
  end if;

  return query
    select st.id, st.name, st.roll_no,
           se.id, se.session_date,
           coalesce(a.status::text, 'absent'), a.marked_at
    from public.attendance_sessions se
    join public.enrollments e on e.subject_id = se.subject_id
    join public.students st on st.id = e.student_id
    left join public.attendance a on a.session_id = se.id and a.student_id = st.id
    where se.subject_id = p_subject_id
    order by se.session_date desc, st.roll_no;
end;
$$;

-- -----------------------------------------------------------------------------
-- 12. Grant RPC execution to signed-in users only
-- -----------------------------------------------------------------------------
revoke all on function public.start_attendance_session(uuid, integer)       from public;
revoke all on function public.end_attendance_session(uuid)                   from public;
revoke all on function public.mark_attendance(text)                         from public;
revoke all on function public.my_attendance_summary()                        from public;
revoke all on function public.my_attendance_records()                        from public;
revoke all on function public.session_roster(uuid)                           from public;
revoke all on function public.subject_attendance_report(uuid)               from public;

grant execute on function public.start_attendance_session(uuid, integer)     to authenticated;
grant execute on function public.end_attendance_session(uuid)                 to authenticated;
grant execute on function public.mark_attendance(text)                       to authenticated;
grant execute on function public.my_attendance_summary()                      to authenticated;
grant execute on function public.my_attendance_records()                      to authenticated;
grant execute on function public.session_roster(uuid)                         to authenticated;
grant execute on function public.subject_attendance_report(uuid)             to authenticated;

grant usage on schema public to anon, authenticated;

-- Read access to everything the app displays.
grant select on public.profiles, public.students, public.teachers, public.subjects,
                 public.enrollments, public.attendance_sessions, public.attendance
  to authenticated;

-- Teachers may manage their own subject roster (RLS scopes it to their subjects).
grant insert, update, delete on public.subjects    to authenticated;
grant insert, delete         on public.enrollments to authenticated;

-- NOTE: attendance_sessions and attendance get NO write grant.
--   sessions are created/closed only through start_/end_attendance_session()
--   and attendance rows only through mark_attendance(), so the validation in
--   the PRD cannot be bypassed from the browser.

-- -----------------------------------------------------------------------------
-- 13. New auth user -> create profile + auto-link student/teacher by email
--     Role is derived from the DB (never from client metadata), so a user
--     cannot sign themselves up as a teacher.
-- -----------------------------------------------------------------------------
create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_email text := lower(coalesce(new.email, ''));
  v_role  public.app_role;
begin
  if v_email = '' then
    return new;
  end if;

  if exists (select 1 from public.teachers where lower(email) = v_email) then
    v_role := 'teacher';
  else
    v_role := 'student';
  end if;

  insert into public.profiles (id, role, full_name)
  values (
    new.id,
    v_role,
    coalesce(
      nullif(new.raw_user_meta_data ->> 'full_name', ''),
      nullif(split_part(v_email, '@', 1), ''),
      'User'
    )
  )
  on conflict (id) do nothing;

  update public.students set auth_id = new.id where lower(email) = v_email and auth_id is null;
  update public.teachers set auth_id = new.id where lower(email) = v_email and auth_id is null;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_auth_user();

-- -----------------------------------------------------------------------------
-- 14. Realtime — powers the teacher's "live attendance" counter
-- -----------------------------------------------------------------------------
do $$ begin
  alter publication supabase_realtime add table public.attendance;
exception when duplicate_object then null; end $$;

-- -----------------------------------------------------------------------------
-- 15. Admin console — the portal manages the directory through these policies.
--     (supabase/admin.sql contains the same statements for existing databases.)
-- -----------------------------------------------------------------------------

-- Teachers: read is already open to any signed-in user; writes are admin only.
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

-- Students: admin may add/edit/remove students.
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

-- Subjects: an admin may create any subject and reassign its teacher.
-- The teacher-owned policies above stay in place — permissive policies are OR'd.
drop policy if exists subjects_admin_insert on public.subjects;
create policy subjects_admin_insert on public.subjects
  for insert to authenticated with check (public.is_admin());
drop policy if exists subjects_admin_update on public.subjects;
create policy subjects_admin_update on public.subjects
  for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- Profiles: an admin may list every account and change a role.
drop policy if exists profiles_admin_select on public.profiles;
create policy profiles_admin_select on public.profiles
  for select to authenticated using (public.is_admin());
drop policy if exists profiles_admin_update on public.profiles;
create policy profiles_admin_update on public.profiles
  for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- Grants: Postgres checks table privileges before policies, so both are needed.
grant insert, update, delete on public.teachers, public.students to authenticated;
grant insert, update, delete on public.subjects    to authenticated;
grant insert, delete         on public.enrollments to authenticated;
grant update                 on public.profiles    to authenticated;

-- Links a teacher/student record to a login that already exists, so the portal
-- works whether the person signs up before or after being added. Never demotes
-- an existing admin. Returns NULL when the person has not signed up yet — the
-- handle_new_auth_user trigger links them at that point.
create or replace function public.admin_sync_user(
  p_email     text,
  p_role      public.app_role,
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
    return null;
  end if;

  insert into public.profiles (id, role, full_name)
  values (v_id, p_role, coalesce(nullif(trim(p_full_name), ''), split_part(p_email, '@', 1)))
  on conflict (id) do update
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
