-- =============================================================================
-- SmartAttend — REPAIR: (re)create the RPC functions + grants
-- =============================================================================
-- Why: PostgREST reports
--   "No function matches the given name and argument types"
-- when it cannot resolve start_attendance_session(uuid, integer) in its schema
-- cache. Two possible causes:
--   (a) the function was never created (schema.sql stopped early), or
--   (b) it exists but PostgREST's cached schema is stale.
--
-- This script fixes both and is idempotent. It does NOT create, alter or drop
-- any table, column or RLS policy. Run it AFTER schema.sql has been run at
-- least through section 4 (the tables must already exist).
--
-- Run: Supabase Dashboard > SQL Editor > New query > paste > Run
-- =============================================================================

-- 1. Tell PostgREST to drop its cached schema and re-read the database.
--    Harmless if the cache was already fresh.
notify pgrst, 'reload schema';

-- -----------------------------------------------------------------------------
-- 2. Helper functions the RPCs depend on (SECURITY DEFINER, so RLS on
--    profiles cannot recurse). Same definitions as schema.sql section 3.
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

-- -----------------------------------------------------------------------------
-- 3. The RPCs (identical bodies to schema.sql sections 5-11)
-- -----------------------------------------------------------------------------
create or replace function public.start_attendance_session(
  p_subject_id        uuid,
  p_duration_seconds  integer default 120
)
returns public.attendance_sessions
language plpgsql security definer set search_path = public
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

  -- Auto-close a previous session whose QR already expired, otherwise the
  -- one-active-session-per-subject index would reject the new row.
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
-- 4. Grants. The revokes must come first: if the earlier run aborted between
--    the revokes and the grants, the functions would exist but be un-callable.
-- -----------------------------------------------------------------------------
revoke all on function public.start_attendance_session(uuid, integer) from public;
revoke all on function public.end_attendance_session(uuid)             from public;
revoke all on function public.mark_attendance(text)                   from public;
revoke all on function public.my_attendance_summary()                  from public;
revoke all on function public.my_attendance_records()                  from public;
revoke all on function public.session_roster(uuid)                     from public;
revoke all on function public.subject_attendance_report(uuid)          from public;

grant execute on function public.start_attendance_session(uuid, integer) to authenticated;
grant execute on function public.end_attendance_session(uuid)             to authenticated;
grant execute on function public.mark_attendance(text)                   to authenticated;
grant execute on function public.my_attendance_summary()                  to authenticated;
grant execute on function public.my_attendance_records()                  to authenticated;
grant execute on function public.session_roster(uuid)                     to authenticated;
grant execute on function public.subject_attendance_report(uuid)          to authenticated;

grant select on public.profiles, public.students, public.teachers, public.subjects,
                 public.enrollments, public.attendance_sessions, public.attendance
  to authenticated;

-- Realtime for the teacher's live counter (harmless if already added).
do $$ begin
  alter publication supabase_realtime add table public.attendance;
exception when duplicate_object then null; end $$;

-- Flush the cache again so the calls above are immediately callable.
notify pgrst, 'reload schema';
