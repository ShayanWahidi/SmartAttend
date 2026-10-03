import { supabase } from "./supabase";
import type {
  AttendanceSession,
  MarkAttendanceResult,
  MyRecord,
  Profile,
  ReportRow,
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

function rethrow(error: { code?: string; message: string; hint?: string } | null, fallback: string) {
  const code = error?.code ?? "error";
  const message = error?.hint ? `${error.hint}` : (error?.message ?? fallback);
  throw new AppError(code, message);
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
