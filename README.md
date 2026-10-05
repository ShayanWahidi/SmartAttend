# SmartAttend — QR-Based College Attendance System

React + Vite + Tailwind CSS + Supabase. Teachers project a short-lived QR code,
students scan it from their phone, attendance is recorded instantly.

Stack: React 18 · Vite · TypeScript · Tailwind CSS v4 · Supabase (Postgres + Auth + Realtime) ·
`qrcode` (generate) · `html5-qrcode` (scan) · Vercel (deploy).

---

## 1. What you must do manually (I cannot do these)

Everything below needs your Supabase account / GitHub / Vercel access.

### Step 1 — Create the Supabase project (5 min)

1. Go to <https://supabase.com> → **New project**.
2. Pick a name, generate a strong database password, choose the region closest to
   your college.
3. Wait ~2 minutes for provisioning.

### Step 2 — Run the database schema (2 min)

1. Supabase Dashboard → **SQL Editor** → **New query**.
2. Open `supabase/schema.sql` from this repo, paste the whole file, click **Run**.
   You should see `Success. No errors returned`.
   (The file is idempotent — safe to run again.)

This creates 7 tables, all Row Level Security policies, 7 RPC functions, the
`handle_new_auth_user` trigger, and enables Realtime on `attendance`.

### Step 3 — Add sample data (2 min)

1. SQL Editor → New query.
2. Open `supabase/seed.sql`, **replace the emails with your own real emails**,
   paste, **Run**.

### Step 4 — Create the login accounts (5 min)

1. Dashboard → **Authentication** → **Users** → **Add user** →
   **Create new user**.
2. For each email from `seed.sql`:
   - Email: exactly the address you used in `seed.sql`
   - Password: choose one (e.g. `smartattend123`)
   - **Tick "Auto Confirm User"** (otherwise nobody can log in)
   - Click **Create user**
3. Repeat for at least **one teacher** and **two students** to test.

> Role is assigned automatically: if the email exists in `teachers` you become a
> teacher, otherwise a student. Signing up with a teacher role is impossible.

### Step 5 — Copy the API keys into the app (2 min)

1. Dashboard → **Project Settings** → **Data API**.
2. Copy `.env.example` → `.env` in this folder.
3. Paste `Project URL` and the `anon` **public** key:

```env
VITE_SUPABASE_URL=https://xxxxxxxxxxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJI...
VITE_APP_URL=http://localhost:5173
```

Never put the `service_role` key in this file or in Git — it bypasses all RLS.

### Step 6 — Run it

```bash
npm install
npm run dev
```

Open <http://localhost:5173>.

> **Camera testing:** `html5-qrcode` needs a secure context. `localhost` is
> treated as secure, but to test with a real phone on your college Wi-Fi you must
> either deploy (Step 8) or serve over HTTPS with a tunnel
> (`npx localtunnel --port 5173`).

### Step 7 — Push to GitHub

```bash
git init
git add .
git commit -m "SmartAttend MVP: QR attendance with Supabase"
git branch -M main
git remote add origin https://github.com/<you>/smartattend.git
git push -u origin main
```

Create the empty repo on GitHub first (do **not** add a README there).

### Step 8 — Deploy to Vercel

1. <https://vercel.com> → **Add New** → **Project** → import the GitHub repo.
2. Framework preset: **Vite**. Build `npm run build`, output `dist`.
3. Add the same three environment variables from Step 5, and set
   `VITE_APP_URL=https://your-app.vercel.app` (this is what gets encoded in the
   QR code — phones need a real reachable URL).
4. **Deploy**, then test on a real phone.

---

## 2. What I already built

```
src/
  App.tsx                      routes + role-based access
  lib/supabase.ts              client, env detection, APP_URL
  lib/api.ts                   every database call (RPC + table reads)
  lib/qr.ts                    QR payload build/parse
  lib/format.ts                dates, %, countdown, CSV export
  lib/types.ts                 shared types
  context/AuthContext.tsx      session + profile + role
  hooks/useSessionRoster.ts    live roster (Realtime + 5s polling fallback)
  components/                  Layout, ProtectedRoute, QrDisplay, QrScanner, Feedback
  pages/Login.tsx              login + first-time signup
  pages/student/               Dashboard, ScanPage, HistoryPage
  pages/teacher/               Dashboard, SessionPage (projector), RecordsPage
  pages/admin/                 Overview, Teachers, Students, Subjects, Users
supabase/schema.sql            tables, RLS, RPCs, triggers, realtime, admin policies
supabase/admin.sql             admin-only migration (policies, grants, admin_sync_user)
supabase/seed.sql              demo teachers/students/subjects/enrollments
```

### Admin console (no SQL needed after the first admin exists)

Run `supabase/admin.sql` once, then use `/admin` to manage everything:

| Tab | What it does |
|---|---|
| Overview | Counts of teachers, students, subjects, enrollments + link status |
| Teachers | Add/edit/remove faculty; shows how many subjects each teaches |
| Students | Add/edit/remove students, search by name/roll no/email |
| Subjects | Create subjects, assign the teacher, edit each class list |
| Users | Every account that has signed in, with role change buttons |

Add people here **before** they sign up. The email you type is the link between
the record and their login: `handle_new_auth_user` assigns the role on signup,
and the `admin_sync_user` RPC links accounts that already existed. No
`service_role` key is ever used in the browser, and the portal cannot grant
admin — the first admin is promoted once via SQL (see `supabase/admin.sql`).

Deleting a student is refused if they have attendance records, since those rows
cascade. Deleting a subject deletes its sessions and attendance records.

### The validation flow (PRD §9) lives in the database, not the browser

`mark_attendance(token)` in `supabase/schema.sql` runs every check in order and
returns a code the UI renders verbatim:

| Check | Response code | Message shown |
|---|---|---|
| No session | `not_logged_in` | Please log in first. |
| Teacher scanning | `forbidden` | Only students can mark attendance. |
| Email not in `students` | `not_registered` | Your login is not linked to a student record… |
| Unknown token | `invalid_qr` | This QR code is not valid. |
| Session closed | `session_closed` | Attendance session is closed. |
| Past `expires_at` | `expired` | QR code expired. |
| Not enrolled | `not_enrolled` | You are not enrolled in this subject. |
| Already scanned | `already_marked` | Attendance already recorded. |
| All pass | `marked` | ✓ Attendance marked successfully |

Duplicate prevention is a database constraint: `unique (student_id, session_id)`
on `attendance`, plus `on conflict do nothing` inside the RPC.

### Security model

- RLS on all 7 tables. Students read only their own rows; teachers read only
  their own subjects.
- `attendance_sessions` and `attendance` have **no INSERT/UPDATE/DELETE grant**.
  Writes are only possible through the validating RPCs, so the checks cannot be
  skipped by calling the REST API directly.
- Only one live session per subject (partial unique index); an expired session is
  auto-closed when a new one starts.
- QR lifetime is 120s (configurable per session, clamped 30–3600s).
- `handle_new_auth_user` derives the role from the database, so nobody can
  self-register as a teacher.

---

## 3. Test script (PRD §18 success criteria)

1. Log in as the teacher → you see your subjects.
2. **Start Attendance** on `CS301` → a QR code and countdown appear.
3. Open the projector view → big QR + live Present/Absent counters.
4. On a second device (or an incognito window) log in as a student →
   **Scan QR** → allow camera → scan → "Attendance marked successfully".
5. Scan the same code again → "Attendance already recorded."
6. Wait for the QR to expire, then scan → "QR code expired."
7. Ask the teacher to **End Session**, then scan the old code →
   "Attendance session is closed."
8. Student **Dashboard** shows the updated percentage; **History** shows the row.
9. Teacher **Records** shows the roster for the session and exports CSV.
10. Log in as admin → `/admin` → add a teacher and a student → sign up as that
    teacher with the same email → confirm the role and their subjects appear
    without touching the SQL editor.

## 4. Useful Supabase checks

- Table editor: `select * from public.attendance order by marked_at desc;`
- Confirm RLS is on: **Table Editor → attendance → RLS** should be enabled.
- Realtime: **Database → Publications → supabase_realtime** should list
  `public.attendance`.
- To promote a user manually (e.g. fix a role):
  `update public.profiles set role = 'teacher' where id = '<auth user id>';`
  — then also set `teachers.auth_id` so they can start sessions.

## 5. Troubleshooting

| Problem | Fix |
|---|---|
| "Supabase is not configured" banner | `.env` missing or values still the placeholder; restart `npm run dev` |
| Login says "Invalid login credentials" | user not created, or email case/whitespace mismatch, or not auto-confirmed |
| Student sees "not linked to a student record" | `students.email` does not match the login email (case-insensitive match) |
| Teacher sees "No subjects assigned" | `subjects.teacher_id` is null or points at another teacher |
| "You are not enrolled in this subject" | no row in `enrollments` for that subject + student |
| Camera never starts | page must be HTTPS or `localhost`; check browser permission |
| Live counter not updating | `attendance` missing from the `supabase_realtime` publication (re-run `schema.sql`) |
| Second session fails with `session_already_active` | a session is genuinely still running — press **End Session** first |
