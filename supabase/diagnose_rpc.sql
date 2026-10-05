-- =============================================================================
-- SmartAttend - diagnostic queries for RPC resolution failures
-- =============================================================================
-- Paste into Supabase Dashboard > SQL Editor > New query > Run, then read the
-- "How to read this" notes at the bottom.
-- =============================================================================

-- 1. Which attendance functions exist, and with what identity arguments?
--    Compare `arguments` with what the app sends: p_subject_id uuid, p_duration_seconds integer
select p.proname                                            as function_name,
       n.nspname                                            as schema,
       pg_get_function_identity_arguments(p.oid)           as arguments,
       pg_get_function_result(p.oid)                        as return_type
from pg_catalog.pg_proc p
join pg_catalog.pg_namespace n on p.pronamespace = n.oid
where p.proname ilike '%attendance%'
order by p.proname;

-- 2. Can the roles PostgREST uses actually call it?
select has_function_privilege('authenticated', 'public.start_attendance_session(uuid,integer)', 'EXECUTE') as teacher_can_execute,
       has_function_privilege('anon',          'public.start_attendance_session(uuid,integer)', 'EXECUTE') as anon_can_execute;

-- 3. Which schemas does PostgREST expose? The function must live in one of them.
select current_setting('pgrst.db_schemas')           as exposed_schemas,
       current_setting('pgrst.db_extra_search_path') as extra_search_path;

-- 4. Do the tables exist, and is RLS on?
select tablename, rowsecurity
from pg_catalog.pg_tables
where schemaname = 'public'
order by tablename;

-- 5. Is subjects.id a uuid? (the app sends subjects.id as p_subject_id)
select column_name, data_type, udt_name
from pg_catalog.information_schema.columns
where table_schema = 'public' and table_name = 'subjects'
order by ordinal_position;

-- 6. Every RLS policy currently installed, and which function each one calls.
--    A policy that references a missing function is a sign of a half-applied run.
select tablename, policyname, cmd, qual, with_check
from pg_catalog.pg_policies
where schemaname = 'public'
order by tablename, policyname;

-- =============================================================================
-- How to read this
-- =============================================================================
-- Query 1 returns 0 rows for start_attendance_session
--   -> the function was never created. Run supabase/repair_rpcs.sql.
--
-- Query 1 shows arguments = "p_subject_id uuid, p_duration_seconds integer"
--   but the app still errors
--   -> the function exists; PostgREST's schema cache is stale. Fix with
--      notify pgrst, 'reload schema';  (included in supabase/repair_rpcs.sql)
--      or Dashboard > Project Settings > API > "Reload schema".
--
-- Query 1 shows a different schema than query 3's exposed_schemas
--   -> the function is in a schema PostgREST does not expose, so it can never
--      be found. Move it into an exposed schema.
--
-- Query 2 shows teacher_can_execute = false
--   -> the revokes ran but the grants did not. Run supabase/repair_rpcs.sql.
--      (This case returns "permission denied", not "no function matches", so it
--      is not the current error, but it is the next failure you would hit.)
--
-- Query 5 shows data_type <> 'uuid' for id
--   -> the column type drifted from the schema file and the app's string uuid
--      cannot be matched. Report it before changing anything.
