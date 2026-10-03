import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import Layout from "@/components/Layout";
import { Card, EmptyState, ErrorBanner, Loader } from "@/components/Feedback";
import { useAuth } from "@/context/AuthContext";
import { fetchMyRecords, fetchMySummary } from "@/lib/api";
import { formatDateTime, overallPercentage, percentageBar, percentageColor } from "@/lib/format";
import type { MyRecord, SubjectSummary } from "@/lib/types";

export default function StudentDashboard() {
  const { student, profile } = useAuth();
  const [summaries, setSummaries] = useState<SubjectSummary[]>([]);
  const [records, setRecords] = useState<MyRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [s, r] = await Promise.all([fetchMySummary(), fetchMyRecords()]);
      setSummaries(s);
      setRecords(r.slice(0, 6));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load your dashboard.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const overall = overallPercentage(summaries);

  return (
    <Layout
      title="Student"
      subtitle="Your attendance overview"
      nav={[
        { to: "/student", label: "Dashboard" },
        { to: "/student/scan", label: "Scan QR" },
        { to: "/student/history", label: "History" },
      ]}
    >
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-sm text-slate-500">Welcome back</p>
          <h1 className="text-2xl font-bold text-slate-900">{student?.name ?? profile?.full_name}</h1>
          {student && <p className="text-sm text-slate-500">Roll No. {student.roll_no}</p>}
        </div>
        <Link
          to="/student/scan"
          className="rounded-xl bg-brand-600 px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-700"
        >
          Scan Attendance QR
        </Link>
      </div>

      {error && <ErrorBanner message={error} onRetry={load} />}
      {loading && <Loader />}

      {!loading && !error && (
        <div className="space-y-6">
          <Card>
            <div className="flex flex-wrap items-center justify-between gap-6">
              <div>
                <p className="text-sm font-medium text-slate-500">Overall Attendance</p>
                <p className={`tabular mt-1 text-5xl font-bold ${percentageColor(overall)}`}>
                  {overall}%
                </p>
                <p className="mt-2 text-sm text-slate-500">
                  {summaries.reduce((a, s) => a + Number(s.present_count), 0)} classes attended out of{" "}
                  {summaries.reduce((a, s) => a + Number(s.total_classes), 0)} held
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {summaries.slice(0, 6).map((s) => (
                  <div key={s.subject_id} className="rounded-xl bg-slate-50 px-4 py-3 text-center">
                    <p className="text-xs font-medium text-slate-500">{s.subject_code ?? "—"}</p>
                    <p className={`tabular text-lg font-bold ${percentageColor(Number(s.percentage))}`}>
                      {Number(s.percentage)}%
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </Card>

          <Card title="Subject-wise Attendance">
            {summaries.length === 0 ? (
              <EmptyState
                title="You are not enrolled in any subject yet"
                hint="Ask your teacher to add your roll number to the subject."
              />
            ) : (
              <ul className="space-y-4">
                {summaries.map((s) => {
                  const pct = Number(s.percentage);
                  return (
                    <li key={s.subject_id}>
                      <div className="mb-1.5 flex items-baseline justify-between gap-3">
                        <span className="text-sm font-medium text-slate-800">
                          {s.subject_name}
                          {s.subject_code && (
                            <span className="ml-2 text-xs text-slate-400">{s.subject_code}</span>
                          )}
                        </span>
                        <span className={`tabular text-sm font-bold ${percentageColor(pct)}`}>{pct}%</span>
                      </div>
                      <div className="h-2.5 overflow-hidden rounded-full bg-slate-100">
                        <div
                          className={`h-full rounded-full ${percentageBar(pct)}`}
                          style={{ width: `${Math.min(100, pct)}%` }}
                        />
                      </div>
                      <p className="mt-1 text-xs text-slate-500">
                        {s.present_count} of {s.total_classes} classes
                      </p>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>

          <Card
            title="Recent Attendance"
            action={
              <Link to="/student/history" className="text-sm font-medium text-brand-600 hover:underline">
                View all
              </Link>
            }
          >
            {records.length === 0 ? (
              <EmptyState title="No attendance recorded yet" hint="Scan your teacher's QR code to begin." />
            ) : (
              <ul className="divide-y divide-slate-100">
                {records.map((r) => (
                  <li key={r.id} className="flex items-center justify-between gap-3 py-2.5">
                    <div>
                      <p className="text-sm font-medium text-slate-800">{r.subject_name}</p>
                      <p className="text-xs text-slate-500">{formatDateTime(r.marked_at)}</p>
                    </div>
                    <StatusPill status={r.status} />
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      )}
    </Layout>
  );
}

export function StatusPill({ status }: { status: string }) {
  const styles: Record<string, string> = {
    present: "bg-emerald-100 text-emerald-700",
    late: "bg-amber-100 text-amber-700",
    absent: "bg-rose-100 text-rose-700",
  };
  return (
    <span
      className={`rounded-full px-2.5 py-1 text-xs font-semibold capitalize ${
        styles[status] ?? "bg-slate-100 text-slate-600"
      }`}
    >
      {status}
    </span>
  );
}
