import { useCallback, useEffect, useMemo, useState } from "react";
import Layout from "@/components/Layout";
import { Card, EmptyState, ErrorBanner, Loader } from "@/components/Feedback";
import { StatusPill } from "@/pages/student/StudentDashboard";
import { useAuth } from "@/context/AuthContext";
import { fetchReport, fetchSubjectsForTeacher } from "@/lib/api";
import { downloadCsv, formatDate, formatTime } from "@/lib/format";
import type { ReportRow, Subject } from "@/lib/types";

/** Teacher records + CSV export (PRD §4 secondary goals). */
export default function RecordsPage() {
  const { teacher } = useAuth();
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [subjectId, setSubjectId] = useState("");
  const [rows, setRows] = useState<ReportRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  useEffect(() => {
    if (!teacher) return;
    fetchSubjectsForTeacher(teacher.id)
      .then((list) => {
        setSubjects(list);
        setSubjectId((prev) => prev || list[0]?.id || "");
      })
      .catch(() => setError("Could not load subjects."));
  }, [teacher]);

  const load = useCallback(async () => {
    if (!subjectId) {
      setRows([]);
      setLoading(false);
      return;
    }
    setError(null);
    try {
      setRows(await fetchReport(subjectId));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load the report.");
    } finally {
      setLoading(false);
    }
  }, [subjectId]);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => r.name.toLowerCase().includes(q) || r.roll_no.toLowerCase().includes(q));
  }, [rows, query]);

  const subject = subjects.find((s) => s.id === subjectId);

  return (
    <Layout
      title="Teacher"
      subtitle="Attendance records for each subject"
      nav={[
        { to: "/teacher", label: "Dashboard" },
        { to: "/teacher/records", label: "Records" },
      ]}
    >
      <div className="space-y-5">
        {error && <ErrorBanner message={error} onRetry={load} />}

        <Card title="Filter">
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <label className="mb-1.5 block text-xs font-medium text-slate-500">Subject</label>
              <select
                value={subjectId}
                onChange={(e) => setSubjectId(e.target.value)}
                className="rounded-xl border border-slate-300 px-3 py-2.5 text-sm"
              >
                {subjects.length === 0 && <option value="">No subjects</option>}
                {subjects.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.code ? `${s.code} — ${s.name}` : s.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="min-w-[12rem] flex-1">
              <label className="mb-1.5 block text-xs font-medium text-slate-500">Search student</label>
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Name or roll number"
                className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm"
              />
            </div>

            <button
              onClick={() =>
                downloadCsv(
                  `attendance-${subject?.code ?? "report"}-${new Date().toISOString().slice(0, 10)}.csv`,
                  filtered.map((r) => ({
                    roll_no: r.roll_no,
                    student: r.name,
                    date: formatDate(r.session_date),
                    status: r.status,
                    marked_at: r.marked_at ? formatTime(r.marked_at) : "",
                  })),
                )
              }
              disabled={filtered.length === 0}
              className="rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-40"
            >
              Export CSV
            </button>
          </div>
        </Card>

        {loading ? (
          <Loader />
        ) : filtered.length === 0 ? (
          <EmptyState
            title="No records yet"
            hint="Run an attendance session from the dashboard — records appear here immediately."
          />
        ) : (
          <Card title={`${subject?.name ?? "Records"} (${filtered.length} rows)`}>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                    <th className="pb-2 pr-3 font-medium">Roll No</th>
                    <th className="pb-2 pr-3 font-medium">Student</th>
                    <th className="pb-2 pr-3 font-medium">Date</th>
                    <th className="pb-2 pr-3 font-medium">Time</th>
                    <th className="pb-2 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filtered.map((r) => (
                    <tr key={`${r.session_id}-${r.student_id}`}>
                      <td className="py-2.5 pr-3 text-slate-600">{r.roll_no}</td>
                      <td className="py-2.5 pr-3 font-medium text-slate-800">{r.name}</td>
                      <td className="py-2.5 pr-3 text-slate-600">{formatDate(r.session_date)}</td>
                      <td className="py-2.5 pr-3 text-slate-600">
                        {r.marked_at ? formatTime(r.marked_at) : "—"}
                      </td>
                      <td className="py-2.5">
                        <StatusPill status={r.status} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        )}
      </div>
    </Layout>
  );
}
