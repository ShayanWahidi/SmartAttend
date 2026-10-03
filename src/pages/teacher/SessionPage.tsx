import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import QrDisplay from "@/components/QrDisplay";
import { ErrorBanner, Loader } from "@/components/Feedback";
import { useSessionRoster } from "@/hooks/useSessionRoster";
import { endSession, fetchSession } from "@/lib/api";
import { formatTime } from "@/lib/format";
import type { AttendanceSession } from "@/lib/types";

/** Full-screen projector view: big QR + live attendance list (PRD §6). */
export default function SessionPage() {
  const { sessionId } = useParams();
  const navigate = useNavigate();

  const [session, setSession] = useState<AttendanceSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [ending, setEnding] = useState(false);
  const [now, setNow] = useState(Date.now());

  const { roster, presentCount, absentCount, loading: rosterLoading } = useSessionRoster(sessionId ?? null);

  const load = useCallback(async () => {
    if (!sessionId) return;
    setError(null);
    try {
      const s = await fetchSession(sessionId);
      if (!s) setError("This session does not exist.");
      setSession(s);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load the session.");
    } finally {
      setLoading(false);
    }
  }, [sessionId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const expired = session ? new Date(session.expires_at).getTime() <= now : false;
  const closed = session?.status === "closed";

  async function handleEnd() {
    if (!session) return;
    setEnding(true);
    setError(null);
    try {
      await endSession(session.id);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not end the session.");
    } finally {
      setEnding(false);
    }
  }

  if (loading) return <Loader label="Loading session…" />;

  if (!session) {
    return (
      <div className="mx-auto max-w-lg p-6">
        <ErrorBanner message={error ?? "Session not found."} />
        <Link to="/teacher" className="mt-4 inline-block text-sm font-medium text-brand-600 hover:underline">
          ← Back to dashboard
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-full bg-slate-900 text-white">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 px-5 py-4">
        <div>
          <p className="text-xs tracking-wide text-slate-400 uppercase">Live Attendance Session</p>
          <h1 className="text-xl font-bold">Subject #{session.subject_id.slice(0, 8)}</h1>
        </div>
        <div className="flex items-center gap-2">
          {closed || expired ? (
            <span className="rounded-full bg-rose-500/15 px-3 py-1.5 text-xs font-semibold text-rose-300">
              {closed ? "Session closed" : "QR expired"}
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/15 px-3 py-1.5 text-xs font-semibold text-emerald-300">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" />
              Live
            </span>
          )}
          <Link
            to="/teacher"
            className="rounded-lg border border-white/20 px-3 py-1.5 text-xs font-medium text-slate-200 hover:bg-white/10"
          >
            Exit
          </Link>
        </div>
      </header>

      <div className="grid gap-6 px-5 py-6 lg:grid-cols-[minmax(0,420px)_1fr]">
        <div className="rounded-2xl bg-white p-6 text-slate-900">
          <QrDisplay token={session.token} expiresAt={session.expires_at} size={340} />
          <p className="mt-4 text-center text-xs text-slate-500">
            Students scan this code with the SmartAttend app on their phone
          </p>
        </div>

        <div className="rounded-2xl bg-white/5 p-5">
          <div className="grid grid-cols-3 gap-3 text-center">
            <Tile label="Total" value={roster.length} tone="text-white" />
            <Tile label="Present" value={presentCount} tone="text-emerald-400" />
            <Tile label="Absent" value={absentCount} tone="text-rose-400" />
          </div>

          <div className="mt-5 flex items-center justify-between">
            <h2 className="text-sm font-semibold tracking-wide text-slate-300 uppercase">Class List</h2>
            {!closed && !expired && (
              <button
                onClick={handleEnd}
                disabled={ending}
                className="rounded-lg bg-rose-600 px-4 py-2 text-xs font-semibold text-white hover:bg-rose-500 disabled:opacity-50"
              >
                {ending ? "Ending…" : "End Session"}
              </button>
            )}
          </div>

          {error && (
            <div className="mt-3">
              <ErrorBanner message={error} />
            </div>
          )}

          <div className="mt-3 max-h-[26rem] overflow-y-auto rounded-xl bg-black/20">
            {rosterLoading && roster.length === 0 ? (
              <p className="px-4 py-6 text-center text-sm text-slate-400">Loading class list…</p>
            ) : roster.length === 0 ? (
              <p className="px-4 py-6 text-center text-sm text-slate-400">
                No students enrolled in this subject yet.
              </p>
            ) : (
              <ul className="divide-y divide-white/5">
                {roster.map((r) => (
                  <li key={r.student_id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                    <div>
                      <p className="text-sm font-medium">{r.name}</p>
                      <p className="text-xs text-slate-400">
                        {r.roll_no}
                        {r.marked_at && ` · ${formatTime(r.marked_at)}`}
                      </p>
                    </div>
                    <span
                      className={`rounded-full px-2.5 py-1 text-xs font-semibold capitalize ${
                        r.status === "absent"
                          ? "bg-white/10 text-slate-300"
                          : "bg-emerald-500/20 text-emerald-300"
                      }`}
                    >
                      {r.status}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <button
            onClick={() => navigate("/teacher")}
            className="mt-4 w-full rounded-xl border border-white/15 py-2.5 text-sm font-medium text-slate-300 hover:bg-white/5"
          >
            Back to dashboard
          </button>
        </div>
      </div>
    </div>
  );
}

function Tile({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <div className="rounded-xl bg-white/5 py-4">
      <p className={`tabular text-3xl font-bold ${tone}`}>{value}</p>
      <p className="text-xs font-medium tracking-wide text-slate-400 uppercase">{label}</p>
    </div>
  );
}
