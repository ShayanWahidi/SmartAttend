-- =============================================================================
-- SmartAttend — Seed data (run AFTER schema.sql, in the SQL Editor)
-- =============================================================================
-- STEP 1: Edit the emails below to your real college emails.
-- STEP 2: Run this file.
-- STEP 3: Create the matching login accounts:
--           Supabase Dashboard > Authentication > Users > "Add user"
--           - Email auto-confirm: ON
--           - Use the SAME email as in this file
--         The trigger links each login to its student/teacher record and sets
--         the role automatically.
-- =============================================================================

-- ---------- Teachers ---------------------------------------------------------
insert into public.teachers (name, email) values
  ('Dr. Anita Sharma', 'anita.sharma@college.edu'),
  ('Prof. Rahul Verma', 'rahul.verma@college.edu')
on conflict (email) do nothing;

-- ---------- Students ---------------------------------------------------------
insert into public.students (name, roll_no, email) values
  ('Aarav Mehta',    'CS21B001', 'aarav.mehta@college.edu'),
  ('Diya Kapoor',    'CS21B002', 'diya.kapoor@college.edu'),
  ('Kabir Singh',    'CS21B003', 'kabir.singh@college.edu'),
  ('Ishaan Rao',     'CS21B004', 'ishaan.rao@college.edu'),
  ('Meera Nair',     'CS21B005', 'meera.nair@college.edu'),
  ('Rohan Das',      'CS21B006', 'rohan.das@college.edu')
on conflict (email) do nothing;

-- ---------- Subjects ---------------------------------------------------------
insert into public.subjects (name, code, teacher_id)
select 'Data Structures & Algorithms', 'CS301',
       (select id from public.teachers where email = 'anita.sharma@college.edu')
where not exists (select 1 from public.subjects where code = 'CS301');

insert into public.subjects (name, code, teacher_id)
select 'Database Management Systems', 'CS302',
       (select id from public.teachers where email = 'anita.sharma@college.edu')
where not exists (select 1 from public.subjects where code = 'CS302');

insert into public.subjects (name, code, teacher_id)
select 'Computer Organisation & Architecture', 'CS303',
       (select id from public.teachers where email = 'rahul.verma@college.edu')
where not exists (select 1 from public.subjects where code = 'CS303');

-- ---------- Enrollments (class roster) --------------------------------------
insert into public.enrollments (subject_id, student_id)
select s.id, st.id
from public.subjects s
cross join public.students st
on conflict (subject_id, student_id) do nothing;
