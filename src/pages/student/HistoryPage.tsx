import { useCallback, useEffect, useMemo, useState } from "react";
import Layout from "@/components/Layout";
import { Card, EmptyState, ErrorBanner, Loader } from "@/components/Feedback";
import { StatusPill } from "./StudentDashboard";
import { fetchMyRecords, fetchMySummary } from "@/lib/api";
import { downloadCsv, formatDateTime, overallPercentage, percentageColor } from "@/lib/format";
import type { MyRecord, SubjectSummary } from "@/lib/types";

export default function StudentHistory() {
  const [records, setRecords] = useState<MyRecord[]>([]);
  const [summaries, setSummaries] = useState<SubjectSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>("all");

  const load = useCallback(async () => {
    setError(null);
    try {
      const [r, s] = await Promise.all([fetchMyRecords(), fetchMySummary()]);
      setRecords(r);
      setSummaries(s);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load history.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(
    () => (filter === "all" ? records : records.filter((r) => r.subject_id === filter)),
    [records, filter],
  );

  return (
    <Layout
      title="Student"
      subtitle="Every class you have attended"
      nav={[
        { to: "/student", label: "Dashboard" },
        { to: "/student/scan", label: "Scan QR" },
        { to: "/student/history", label: "History" },
      ]}
    >
      <div className="space-y-5">
        {error && <ErrorBanner message={error} onRetry={load} />}
        {loading && <Loader />}

        {!loading && !error && (
          <>
            <Card title="Subject Summary">
              {summaries.length === 0 ? (
                <EmptyState title="No subjects yet" />
              ) : (
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {summaries.map((s) => (
                    <div key={s.subject_id} className="rounded-xl border border-slate-200 px-4 py-3">
                      <p className="text-sm font-medium text-slate-800">{s.subject_name}</p>
                      <p className={`tabular mt-1 text-2xl font-bold ${percentageColor(Number(s.percentage))}`}>
                        {Number(s.percentage)}%
                      </p>
                      <p className="text-xs text-slate-500">
                        {s.present_count}/{s.total_classes} classes
                      </p>
                    </div>
                  ))}
                  <div className="rounded-xl border border-brand-200 bg-brand-50 px-4 py-3">
                    <p className="text-sm font-medium text-brand-900">Overall</p>
                    <p className="tabular mt-1 text-2xl font-bold text-brand-700">
                      {overallPercentage(summaries)}%
                    </p>
                    <p className="text-xs text-brand-700/70">across all subjects</p>
                  </div>
                </div>
              )}
            </Card>

            <Card
              title={`Attendance Records (${filtered.length})`}
              action={
                <div className="flex items-center gap-2">
                  <select
                    value={filter}
                    onChange={(e) => setFilter(e.target.value)}
                    className="rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs font-medium text-slate-600"
                  >
                    <option value="all">All subjects</option>
                    {summaries.map((s) => (
                      <option key={s.subject_id} value={s.subject_id}>
                        {s.subject_code ?? s.subject_name}
                      </option>
                    ))}
                  </select>
                  <button
                    onClick={() =>
                      downloadCsv(
                        "my-attendance.csv",
                        filtered.map((r) => ({
                          subject: r.subject_name,
                          code: r.subject_code ?? "",
                          date: new Date(r.marked_at).toLocaleDateString("en-GB"),
                          time: new Date(r.marked_at).toLocaleTimeString("en-US", {
                            hour: "2-digit",
                            minute: "2-digit",
                            hour12: true,
                          }),
                          status: r.status,
                        })),
                      )
                    }
                    disabled={filtered.length === 0}
                    className="rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-40"
                  >
                    Export CSV
                  </button>
                </div>
              }
            >
              {filtered.length === 0 ? (
                <EmptyState title="No records for this filter" />
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                        <th className="pb-2 pr-3 font-medium">Subject</th>
                        <th className="pb-2 pr-3 font-medium">Date &amp; time</th>
                        <th className="pb-2 font-medium">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {filtered.map((r) => (
                        <tr key={r.id}>
                          <td className="py-2.5 pr-3 font-medium text-slate-800">
                            {r.subject_name}
                            {r.subject_code && (
                              <span className="ml-2 text-xs text-slate-400">{r.subject_code}</span>
                            )}
                          </td>
                          <td className="py-2.5 pr-3 text-slate-600">{formatDateTime(r.marked_at)}</td>
                          <td className="py-2.5">
                            <StatusPill status={r.status} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>
          </>
        )}
      </div>
    </Layout>
  );
}
