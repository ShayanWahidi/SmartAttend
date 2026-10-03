import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import Layout from "@/components/Layout";
import { Card, EmptyState, ErrorBanner, Loader } from "@/components/Feedback";
import { useAuth } from "@/context/AuthContext";
import { useSessionRoster } from "@/hooks/useSessionRoster";
import {
  AppError,
  endSession,
  fetchActiveSession,
  fetchRecentSessions,
  fetchSubjectsForTeacher,
  startSession,
} from "@/lib/api";
import { formatDate, formatTime, secondsLeft } from "@/lib/format";
import type { AttendanceSession, Subject } from "@/lib/types";

export default function TeacherDashboard() {
  const { teacher, profile } = useAuth();
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [active, setActive] = useState<Record<string, AttendanceSession>>({});
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!teacher) {
      setLoading(false);
      return;
    }
    setError(null);
    try {
      const list = await fetchSubjectsForTeacher(teacher.id);
      setSubjects(list);
      setSelectedId((prev) => (prev && list.some((s) => s.id === prev) ? prev : (list[0]?.id ?? "")));

      const running: Record<string, AttendanceSession> = {};
      await Promise.all(
        list.map(async (s) => {
          const session = await fetchActiveSession(s.id);
          if (session) running[s.id] = session;
        }),
      );
      setActive(running);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load your subjects.");
    } finally {
      setLoading(false);
    }
  }, [teacher]);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleStart(subjectId: string) {
    setStarting(subjectId);
    setError(null);
    try {
      const session = await startSession(subjectId, 120);
      setActive((prev) => ({ ...prev, [subjectId]: session }));
    } catch (e) {
      setError(e instanceof AppError ? e.message : e instanceof Error ? e.message : "Could not start.");
    } finally {
      setStarting(null);
    }
  }

  const selected = subjects.find((s) => s.id === selectedId) ?? null;

  return (
    <Layout
      title="Teacher"
      subtitle="Pick a subject and run attendance"
      nav={[
        { to: "/teacher", label: "Dashboard" },
        { to: "/teacher/records", label: "Records" },
      ]}
    >
      <div className="mb-6">
        <p className="text-sm text-slate-500">Welcome back</p>
        <h1 className="text-2xl font-bold text-slate-900">{teacher?.name ?? profile?.full_name}</h1>
      </div>

      {error && <ErrorBanner message={error} onRetry={load} />}
      {loading && <Loader />}

      {!loading && teacher && subjects.length === 0 && (
        <EmptyState
          title="No subjects assigned to you"
          hint="An admin assigns subjects by setting subjects.teacher_id to your teacher record."
        />
      )}

      {!loading && teacher && subjects.length > 0 && (
        <div className="space-y-6">
          <Card title="My Subjects">
            <div className="flex flex-wrap gap-2">
              {subjects.map((s) => {
                const running = active[s.id];
                return (
                  <button
                    key={s.id}
                    onClick={() => setSelectedId(s.id)}
                    className={`rounded-xl border px-4 py-2.5 text-left transition ${
                      selectedId === s.id
                        ? "border-brand-500 bg-brand-50 ring-2 ring-brand-100"
                        : "border-slate-200 bg-white hover:border-slate-300"
                    }`}
                  >
                    <span className="block text-sm font-semibold text-slate-800">{s.code ?? s.name}</span>
                    <span className="block text-xs text-slate-500">{s.name}</span>
                    {running && (
                      <span className="mt-1 inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-600">
                        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" />
                        Live · {secondsLeft(running.expires_at)}s left
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </Card>

          {selected && (
            <Card
              title={`Attendance — ${selected.code ?? selected.name}`}
              action={
                active[selected.id] ? (
                  <Link
                    to={`/teacher/session/${active[selected.id].id}`}
                    className="text-sm font-medium text-brand-600 hover:underline"
                  >
                    Projector view
                  </Link>
                ) : null
              }
            >
              {active[selected.id] ? (
                <LiveSummary session={active[selected.id]} onEnded={load} />
              ) : (
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div>
                    <p className="text-sm text-slate-600">
                      No session running. Starting one shows a QR code that expires in 2 minutes.
                    </p>
                    <p className="mt-1 text-xs text-slate-400">
                      Students who never scan are counted as absent.
                    </p>
                  </div>
                  <button
                    onClick={() => handleStart(selected.id)}
                    disabled={starting === selected.id}
                    className="rounded-xl bg-brand-600 px-5 py-3 text-sm font-semibold text-white shadow-sm hover:bg-brand-700 disabled:opacity-50"
                  >
                    {starting === selected.id ? "Starting…" : "Start Attendance"}
                  </button>
                </div>
              )}
            </Card>
          )}

          <RecentSessions subjectId={selected?.id} />
        </div>
      )}
    </Layout>
  );
}

function LiveSummary({ session, onEnded }: { session: AttendanceSession; onEnded: () => void }) {
  const { presentCount, absentCount, roster } = useSessionRoster(session.id);
  const [ending, setEnding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleEnd() {
    setEnding(true);
    setError(null);
    try {
      await endSession(session.id);
      onEnded();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not end the session.");
    } finally {
      setEnding(false);
    }
  }

  return (
    <div>
      <div className="grid grid-cols-3 gap-3 text-center">
        <Stat label="Total" value={roster.length} tone="text-slate-900" />
        <Stat label="Present" value={presentCount} tone="text-emerald-600" />
        <Stat label="Absent" value={absentCount} tone="text-rose-600" />
      </div>

      {error && <p className="mt-3 text-sm text-rose-600">{error}</p>}

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-slate-500">
          Started {formatTime(session.created_at)} · QR expires {formatTime(session.expires_at)}
        </p>
        <button
          onClick={handleEnd}
          disabled={ending}
          className="rounded-xl bg-rose-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-rose-700 disabled:opacity-50"
        >
          {ending ? "Ending…" : "End Session"}
        </button>
      </div>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <div className="rounded-xl bg-slate-50 py-3">
      <p className={`tabular text-2xl font-bold ${tone}`}>{value}</p>
      <p className="text-xs font-medium tracking-wide text-slate-500 uppercase">{label}</p>
    </div>
  );
}

function RecentSessions({ subjectId }: { subjectId?: string }) {
  const [sessions, setSessions] = useState<AttendanceSession[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!subjectId) {
      setLoading(false);
      return;
    }
    let current = true;
    setLoading(true);
    fetchRecentSessions(subjectId, 8)
      .then((rows) => {
        if (current) setSessions(rows);
      })
      .finally(() => {
        if (current) setLoading(false);
      });
    return () => {
      current = false;
    };
  }, [subjectId]);

  return (
    <Card title="Recent Sessions">
      {loading ? (
        <p className="py-6 text-center text-sm text-slate-500">Loading…</p>
      ) : sessions.length === 0 ? (
        <EmptyState title="No sessions yet for this subject" />
      ) : (
        <ul className="divide-y divide-slate-100">
          {sessions.map((s) => (
            <li key={s.id} className="flex items-center justify-between gap-3 py-2.5">
              <div>
                <p className="text-sm font-medium text-slate-800">{formatDate(s.created_at)}</p>
                <p className="text-xs text-slate-500">
                  {formatTime(s.created_at)} – {s.closed_at ? formatTime(s.closed_at) : "open"} · token{" "}
                  {s.token}
                </p>
              </div>
              <Link
                to={`/teacher/session/${s.id}`}
                className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
              >
                View
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
