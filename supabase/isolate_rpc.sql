-- =============================================================================
-- SmartAttend — isolation test: is the problem Postgres or PostgREST?
-- =============================================================================
-- Run in Supabase SQL Editor. Copy me the FULL output.
--
-- STEP 1 proves whether the function exists in THIS database, as THIS user.
-- STEP 2 calls it directly, with no PostgREST involved.
--         - STEP 2 works  -> Postgres is fine, the fault is PostgREST
--                             (stale cache, wrong project, or schema config)
--         - STEP 2 fails -> the fault is in the function/DB itself
-- =============================================================================

-- STEP 1a. Exhaustive listing: every schema, every overload, full ACL.
select n.nspname                                as schema,
       p.proname                                as function_name,
       pg_get_function_identity_arguments(p.oid) as args,
       p.prokind                                as kind,          -- f = normal function
       pg_get_userbyid(p.proowner)              as owner,
       p.proacl                                 as acl,           -- null = default privileges
       array_to_string(p.proconfig, ', ')        as config
from pg_proc p
join pg_namespace n on p.pronamespace = n.oid
where p.proname ilike '%attendance%'
order by n.nspname, p.proname, args;

-- STEP 1b. What database/schema is this editor even connected to?
select current_database()      as database,
       current_user            as connected_as,
       current_schema()        as search_path,
       current_setting('pgrst.db_schemas', true)         as pgrst_db_schemas,
       current_setting('pgrst.db_extra_search_path', true) as pgrst_extra_path,
       current_setting('pgrst.db_pre_request', true)     as pgrst_pre_request;

-- STEP 1c. Does a same-named function exist in ANOTHER schema?
--           Two exposed schemas both containing the name = ambiguous lookup.
select n.nspname, p.proname, pg_get_function_identity_arguments(p.oid) as args
from pg_proc p
join pg_namespace n on p.pronamespace = n.oid
where p.proname = 'start_attendance_session';

-- STEP 1d. Do the tables the app depends on exist in THIS database?
select tablename, rowsecurity as rls_on
from pg_tables where schemaname = 'public' order by tablename;

-- =============================================================================
-- STEP 2. Direct call, no PostgREST. Replace the two values below.
--   subject uuid : from  select id, code from public.subjects where code='CS302';
--   teacher uuid : from  select id from public.teachers limit 1;
-- Because this runs in the SQL editor, auth.uid() is NULL, so the function will
-- stop at the first check and raise 'not_a_teacher'. THAT IS A SUCCESSFUL CALL —
-- it proves the function exists and is being invoked correctly.
-- =============================================================================
select public.start_attendance_session(
         (select id from public.subjects where code = 'CS302'),
         120
       );

-- =============================================================================
-- Reading the output
-- =============================================================================
-- STEP 1a returns NO ROWS
--   -> the function is not in this database. Nothing about the frontend or the
--      RPC call can work until it is. Re-run repair_rpcs.sql and check for a
--      RED error in the SQL Editor panel (scroll up — the error is often at the
--      bottom of a long script).
--
-- STEP 1a shows schema <> 'public'
--   -> the function is in a schema PostgREST does not expose.
--      Check STEP 1b pgrst_db_schemas. Fix by moving it to an exposed schema.
--
-- STEP 1a shows the right args, but STEP 2 raises 'not_a_teacher'
--   -> the function is present and callable. The problem is 100% PostgREST:
--      stale cache, or the frontend points at a different Supabase project
--      than this SQL editor.
--
-- STEP 1b database name is not your project's database
--   -> you are running SQL in the wrong project.
