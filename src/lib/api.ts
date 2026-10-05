import { supabase } from "./supabase";
import type {
  AttendanceSession,
  MarkAttendanceResult,
  MyRecord,
  Profile,
  ReportRow,
  Role,
  RosterRow,
  Student,
  Subject,
  SubjectSummary,
  Teacher,
} from "./types";

/** Thrown for RPC failures so callers can show `hint`/`message` from Postgres. */
export class AppError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

/**
 * Postgres errors arrive with `message` + `hint`:
 *   - `raise exception 'session_already_active' using hint = 'An attendance
 *      session is already running…'`  -> message is a bare code, hint is the
 *      human-readable text.
 *   - `function public.foo(uuid, bigint) does not exist`  -> message is the
 *      real diagnostic (it names the types Postgres was given), hint is the
 *      generic "add explicit type casts" boilerplate.
 * So: use `hint` only when `message` is a bare code, and never drop the message,
 * otherwise real server-side errors get replaced by useless boilerplate.
 */
function rethrow(
  error: { code?: string; message?: string; hint?: string; details?: string } | null,
  fallback: string,
) {
  if (!error) throw new AppError("error", fallback);

  const message = (error.message ?? "").trim();
  const hint = (error.hint ?? "").trim();

  // A bare machine code (no spaces, no parentheses) is not useful to show.
  const descriptive = /[\s(]/.test(message);
  const primary = descriptive ? message : hint || message || fallback;
  const secondary = descriptive && hint && hint !== message ? hint : "";

  throw new AppError(error.code ?? "error", [primary, secondary].filter(Boolean).join(" — "));
}

/* ------------------------------------------------------------------ profile */

export async function fetchProfile(userId: string): Promise<Profile | null> {
  const { data, error } = await supabase
    .from("profiles")
    .select("id, role, full_name")
    .eq("id", userId)
    .maybeSingle();
  if (error) rethrow(error, "Could not load profile");
  return (data as Profile | null) ?? null;
}

export async function fetchStudentForUser(userId: string): Promise<Student | null> {
  const { data, error } = await supabase
    .from("students")
    .select("id, name, roll_no, email, auth_id")
    .eq("auth_id", userId)
    .maybeSingle();
  if (error) rethrow(error, "Could not load student record");
  return (data as Student | null) ?? null;
}

export async function fetchTeacherForUser(userId: string): Promise<Teacher | null> {
  const { data, error } = await supabase
    .from("teachers")
    .select("id, name, email, auth_id")
    .eq("auth_id", userId)
    .maybeSingle();
  if (error) rethrow(error, "Could not load teacher record");
  return (data as Teacher | null) ?? null;
}

/* ----------------------------------------------------------------- subjects */

export async function fetchSubjectsForTeacher(teacherId: string): Promise<Subject[]> {
  const { data, error } = await supabase
    .from("subjects")
    .select("id, name, code, teacher_id")
    .eq("teacher_id", teacherId)
    .order("name");
  if (error) rethrow(error, "Could not load subjects");
  return (data as Subject[]) ?? [];
}

/* ----------------------------------------------------------------- sessions */

export async function fetchActiveSession(subjectId: string): Promise<AttendanceSession | null> {
  const { data, error } = await supabase
    .from("attendance_sessions")
    .select("*")
    .eq("subject_id", subjectId)
    .eq("status", "active")
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) rethrow(error, "Could not load session");
  return (data as AttendanceSession | null) ?? null;
}

export async function startSession(subjectId: string, durationSeconds: number): Promise<AttendanceSession> {
  const { data, error } = await supabase.rpc("start_attendance_session", {
    p_subject_id: subjectId,
    p_duration_seconds: durationSeconds,
  });
  if (error) rethrow(error, "Could not start attendance session");
  return data as AttendanceSession;
}

export async function endSession(sessionId: string): Promise<AttendanceSession> {
  const { data, error } = await supabase.rpc("end_attendance_session", { p_session_id: sessionId });
  if (error) rethrow(error, "Could not end attendance session");
  return data as AttendanceSession;
}

export async function fetchSession(sessionId: string): Promise<AttendanceSession | null> {
  const { data, error } = await supabase
    .from("attendance_sessions")
    .select("*")
    .eq("id", sessionId)
    .maybeSingle();
  if (error) rethrow(error, "Could not load session");
  return (data as AttendanceSession | null) ?? null;
}

export async function fetchRecentSessions(subjectId: string, limit = 10): Promise<AttendanceSession[]> {
  const { data, error } = await supabase
    .from("attendance_sessions")
    .select("*")
    .eq("subject_id", subjectId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) rethrow(error, "Could not load session history");
  return (data as AttendanceSession[]) ?? [];
}

export async function fetchRoster(sessionId: string): Promise<RosterRow[]> {
  const { data, error } = await supabase.rpc("session_roster", { p_session_id: sessionId });
  if (error) rethrow(error, "Could not load class list");
  return (data as RosterRow[]) ?? [];
}

export async function fetchReport(subjectId: string): Promise<ReportRow[]> {
  const { data, error } = await supabase.rpc("subject_attendance_report", { p_subject_id: subjectId });
  if (error) rethrow(error, "Could not load report");
  return (data as ReportRow[]) ?? [];
}

/* --------------------------------------------------------------- attendance */

export async function markAttendance(token: string): Promise<MarkAttendanceResult> {
  const { data, error } = await supabase.rpc("mark_attendance", { p_token: token });
  if (error) rethrow(error, "Could not mark attendance");
  return data as MarkAttendanceResult;
}

export async function fetchMySummary(): Promise<SubjectSummary[]> {
  const { data, error } = await supabase.rpc("my_attendance_summary");
  if (error) rethrow(error, "Could not load attendance summary");
  return (data as SubjectSummary[]) ?? [];
}

export async function fetchMyRecords(): Promise<MyRecord[]> {
  const { data, error } = await supabase.rpc("my_attendance_records");
  if (error) rethrow(error, "Could not load attendance history");
  return (data as MyRecord[]) ?? [];
}

/* ---------------------------------------------------------------- admin */

export interface AdminStats {
  teachers: number;
  students: number;
  subjects: number;
  enrollments: number;
  linkedStudents: number;
  linkedTeachers: number;
}

async function countOf(table: string, where?: { column: string; notNull: boolean }) {
  let query = supabase.from(table).select("*", { count: "exact", head: true });
  if (where) query = query.not(where.column, "is", null);
  const { count, error } = await query;
  if (error) rethrow(error, `Could not count ${table}`);
  return count ?? 0;
}

export async function fetchAdminStats(): Promise<AdminStats> {
  const [teachers, students, subjects, enrollments, linkedStudents, linkedTeachers] = await Promise.all([
    countOf("teachers"),
    countOf("students"),
    countOf("subjects"),
    countOf("enrollments"),
    countOf("students", { column: "auth_id", notNull: true }),
    countOf("teachers", { column: "auth_id", notNull: true }),
  ]);
  return { teachers, students, subjects, enrollments, linkedStudents, linkedTeachers };
}

export async function fetchAllTeachers(): Promise<Teacher[]> {
  const { data, error } = await supabase
    .from("teachers")
    .select("id, name, email, auth_id")
    .order("name");
  if (error) rethrow(error, "Could not load teachers");
  return (data as Teacher[]) ?? [];
}

export async function fetchAllStudents(): Promise<Student[]> {
  const { data, error } = await supabase
    .from("students")
    .select("id, name, roll_no, email, auth_id")
    .order("roll_no");
  if (error) rethrow(error, "Could not load students");
  return (data as Student[]) ?? [];
}

export async function fetchAllSubjects(): Promise<Subject[]> {
  const { data, error } = await supabase
    .from("subjects")
    .select("id, name, code, teacher_id")
    .order("name");
  if (error) rethrow(error, "Could not load subjects");
  return (data as Subject[]) ?? [];
}

export async function fetchEnrollments(subjectId: string): Promise<string[]> {
  const { data, error } = await supabase
    .from("enrollments")
    .select("student_id")
    .eq("subject_id", subjectId);
  if (error) rethrow(error, "Could not load the class list");
  return (data ?? []).map((r) => r.student_id as string);
}

/**
 * Links a teacher/student record to a login that already exists.
 * Resolves to false when the person has not signed up yet — the
 * handle_new_auth_user trigger links them automatically when they do.
 */
export async function syncUser(email: string, role: "student" | "teacher", fullName: string) {
  const { data, error } = await supabase.rpc("admin_sync_user", {
    p_email: email,
    p_role: role,
    p_full_name: fullName,
  });
  if (error) rethrow(error, "Could not sync the account");
  return data !== null;
}

export async function createTeacher(name: string, email: string): Promise<Teacher> {
  const { data, error } = await supabase
    .from("teachers")
    .insert({ name: name.trim(), email: email.trim().toLowerCase() })
    .select("id, name, email, auth_id")
    .single();
  if (error) rethrow(error, "Could not add the teacher");
  return data as Teacher;
}

export async function updateTeacher(id: string, patch: Partial<Pick<Teacher, "name" | "email">>) {
  const { error } = await supabase.from("teachers").update(patch).eq("id", id);
  if (error) rethrow(error, "Could not update the teacher");
}

export async function deleteTeacher(id: string) {
  const { error } = await supabase.from("teachers").delete().eq("id", id);
  if (error) rethrow(error, "Could not remove the teacher");
}

export async function createStudent(name: string, rollNo: string, email: string): Promise<Student> {
  const { data, error } = await supabase
    .from("students")
    .insert({ name: name.trim(), roll_no: rollNo.trim(), email: email.trim().toLowerCase() })
    .select("id, name, roll_no, email, auth_id")
    .single();
  if (error) rethrow(error, "Could not add the student");
  return data as Student;
}

export async function updateStudent(id: string, patch: Partial<Pick<Student, "name" | "roll_no" | "email">>) {
  const { error } = await supabase.from("students").update(patch).eq("id", id);
  if (error) rethrow(error, "Could not update the student");
}

/** Attendance rows are cascade-deleted with the student, so block destructive deletes. */
export async function countStudentAttendance(studentId: string): Promise<number> {
  const { count, error } = await supabase
    .from("attendance")
    .select("id", { count: "exact", head: true })
    .eq("student_id", studentId);
  if (error) rethrow(error, "Could not check attendance history");
  return count ?? 0;
}

export async function deleteStudent(id: string) {
  const { error } = await supabase.from("students").delete().eq("id", id);
  if (error) rethrow(error, "Could not remove the student");
}

export async function createSubject(name: string, code: string, teacherId: string | null): Promise<Subject> {
  const { data, error } = await supabase
    .from("subjects")
    .insert({
      name: name.trim(),
      code: code.trim() ? code.trim().toUpperCase() : null,
      teacher_id: teacherId,
    })
    .select("id, name, code, teacher_id")
    .single();
  if (error) rethrow(error, "Could not create the subject");
  return data as Subject;
}

export async function updateSubject(id: string, patch: Partial<Pick<Subject, "name" | "code" | "teacher_id">>) {
  const { error } = await supabase.from("subjects").update(patch).eq("id", id);
  if (error) rethrow(error, "Could not update the subject");
}

export async function deleteSubject(id: string) {
  const { error } = await supabase.from("subjects").delete().eq("id", id);
  if (error) rethrow(error, "Could not delete the subject");
}

export async function enrollStudents(subjectId: string, studentIds: string[]) {
  if (studentIds.length === 0) return;
  const { error } = await supabase.from("enrollments").insert(
    studentIds.map((student_id) => ({ subject_id: subjectId, student_id })),
  );
  if (error) rethrow(error, "Could not add students to the subject");
}

export async function unenrollStudent(subjectId: string, studentId: string) {
  const { error } = await supabase
    .from("enrollments")
    .delete()
    .eq("subject_id", subjectId)
    .eq("student_id", studentId);
  if (error) rethrow(error, "Could not remove the student from the subject");
}

export async function fetchAllProfiles(): Promise<Profile[]> {
  const { data, error } = await supabase.from("profiles").select("id, role, full_name");
  if (error) rethrow(error, "Could not load accounts");
  return (data as Profile[]) ?? [];
}

export async function updateProfileRole(id: string, role: Role) {
  const { error } = await supabase.from("profiles").update({ role }).eq("id", id);
  if (error) rethrow(error, "Could not change the role");
}
