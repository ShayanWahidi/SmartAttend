export type Role = "student" | "teacher" | "admin";

export interface Profile {
  id: string;
  role: Role;
  full_name: string;
}

export interface Student {
  id: string;
  name: string;
  roll_no: string;
  email: string;
  auth_id: string | null;
}

export interface Teacher {
  id: string;
  name: string;
  email: string;
  auth_id: string | null;
}

export interface Subject {
  id: string;
  name: string;
  code: string | null;
  teacher_id: string | null;
  teacher?: Pick<Teacher, "id" | "name"> | null;
}

export type SessionStatus = "active" | "closed";

export interface AttendanceSession {
  id: string;
  subject_id: string;
  teacher_id: string;
  token: string;
  status: SessionStatus;
  qr_duration_seconds: number;
  session_date: string;
  created_at: string;
  expires_at: string;
  closed_at: string | null;
}

export type AttendanceStatus = "present" | "absent" | "late";

export interface AttendanceRow {
  id: string;
  student_id: string;
  subject_id: string;
  session_id: string;
  status: AttendanceStatus;
  marked_at: string;
}

export interface SubjectSummary {
  subject_id: string;
  subject_name: string;
  subject_code: string | null;
  present_count: number;
  total_classes: number;
  percentage: number;
}

export interface MyRecord {
  id: string;
  subject_id: string;
  subject_name: string;
  subject_code: string | null;
  status: string;
  marked_at: string;
}

export interface RosterRow {
  student_id: string;
  name: string;
  roll_no: string;
  status: string;
  marked_at: string | null;
}

export interface ReportRow {
  student_id: string;
  name: string;
  roll_no: string;
  session_id: string;
  session_date: string;
  status: string;
  marked_at: string | null;
}

export interface MarkAttendanceResult {
  ok: boolean;
  code:
    | "marked"
    | "not_logged_in"
    | "forbidden"
    | "not_registered"
    | "invalid_qr"
    | "session_closed"
    | "expired"
    | "not_enrolled"
    | "already_marked";
  message: string;
  subject?: string;
  subject_id?: string;
  marked_at?: string;
}
