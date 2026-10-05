-- =============================================================================
-- SmartAttend — fix: 42883 function gen_random_bytes(integer) does not exist
-- =============================================================================
-- Re-running this file is harmless: the ALTER is idempotent and the queries
-- are read-only.
--
-- Why this was the bug
-- --------------------
-- start_attendance_session() builds the QR token with
--       upper(encode(gen_random_bytes(6), 'hex'))
-- gen_random_bytes() is part of the pgcrypto extension. Supabase installs
-- extensions into the `extensions` schema, but the function was declared
--       set search_path = public
-- so Postgres could not resolve the name:
--       ERROR 42883: function gen_random_bytes(integer) does not exist
--       HINT: No function matches the given name and argument types.
--
-- That HINT is generic overloading boilerplate and unrelated to this problem.
-- gen_random_uuid() is unaffected because it lives in pg_catalog, which is
-- always on the search path — which is why the table id defaults kept working.
--
-- NOTE: every catalog query below is written as pg_catalog.<view> on purpose.
-- An unqualified pg_proc resolved to a different relation on this project,
-- which is why a previous version of this check failed with
-- "column p.pronamespace does not exist".
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. THE FIX (idempotent). Only the function's GUC changes.
-- -----------------------------------------------------------------------------
alter function public.start_attendance_session(uuid, integer)
  set search_path = public, extensions;

-- -----------------------------------------------------------------------------
-- 2. Verify — expect config = "search_path=public, extensions"
--    Unqualified names, no alias, no join: the simplest possible query.
-- -----------------------------------------------------------------------------
select proname, proconfig
from pg_catalog.pg_proc
where proname = 'start_attendance_session';

-- -----------------------------------------------------------------------------
-- 3. Where does pgcrypto actually live?
--    'extensions' on Supabase, 'public' on some self-hosted setups.
--    Either one works with the search_path set above.
-- -----------------------------------------------------------------------------
select e.extname, n.nspname as installed_in
from pg_catalog.pg_extension e
join pg_catalog.pg_namespace n on n.oid = e.extnamespace
where e.extname = 'pgcrypto';

-- -----------------------------------------------------------------------------
-- 4. What is shadowing pg_catalog.pg_proc? (diagnoses the 42703 error)
--    Returns more than one row if something else is named pg_proc.
-- -----------------------------------------------------------------------------
select n.nspname as shadowing_schema, c.relname, c.relkind
from pg_catalog.pg_class c
join pg_catalog.pg_namespace n on n.oid = c.relnamespace
where c.relname in ('pg_proc', 'pg_namespace', 'pg_extension');

-- -----------------------------------------------------------------------------
-- 5. End-to-end proof, run as a signed-in teacher. Replaces the uuid below with
--    (select id from public.subjects where code = 'CS302').
--    Expect a row, NOT "not_a_teacher".
-- -----------------------------------------------------------------------------
-- select token, status, expires_at
-- from public.start_attendance_session(
--        (select id from public.subjects where code = 'CS302'), 120);
