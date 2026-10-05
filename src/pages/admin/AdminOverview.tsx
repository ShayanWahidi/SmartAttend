import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import AdminShell from "./AdminShell";
import { Card, ErrorBanner, Loader } from "@/components/Feedback";
import { Badge } from "@/components/ui";
import { fetchAdminStats } from "@/lib/api";
import type { AdminStats } from "@/lib/api";

const LINKS = [
  { to: "/admin/teachers", title: "Teachers", hint: "Add faculty and their login email" },
  { to: "/admin/students", title: "Students", hint: "Add students with roll numbers" },
  { to: "/admin/subjects", title: "Subjects", hint: "Create subjects, assign teachers, build class lists" },
  { to: "/admin/users", title: "Users", hint: "See who has logged in and change roles" },
];

export default function AdminOverview() {
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setStats(await fetchAdminStats());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load the dashboard.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <AdminShell subtitle="Manage teachers, students and subjects from here — no SQL needed.">
      <div className="space-y-6">
        {error && <ErrorBanner message={error} onRetry={load} />}
        {loading && <Loader />}

        {stats && (
          <>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Stat label="Teachers" value={stats.teachers} sub={`${stats.linkedTeachers} linked to a login`} />
              <Stat label="Students" value={stats.students} sub={`${stats.linkedStudents} linked to a login`} />
              <Stat label="Subjects" value={stats.subjects} />
              <Stat label="Enrollments" value={stats.enrollments} />
            </div>

            <Card title="Getting started">
              <ol className="space-y-2.5 text-sm text-slate-600">
                <li>
                  <span className="font-semibold text-slate-800">1.</span> Add your teachers on the{" "}
                  <Link to="/admin/teachers" className="font-medium text-brand-600 hover:underline">
                    Teachers
                  </Link>{" "}
                  tab with their college email.
                </li>
                <li>
                  <span className="font-semibold text-slate-800">2.</span> Add students on the{" "}
                  <Link to="/admin/students" className="font-medium text-brand-600 hover:underline">
                    Students
                  </Link>{" "}
                  tab with roll number and email.
                </li>
                <li>
                  <span className="font-semibold text-slate-800">3.</span> Create a subject, pick its
                  teacher, and build the class list on the{" "}
                  <Link to="/admin/subjects" className="font-medium text-brand-600 hover:underline">
                    Subjects
                  </Link>{" "}
                  tab.
                </li>
                <li>
                  <span className="font-semibold text-slate-800">4.</span> Everyone signs up on the login
                  page using the same email — their role and subject access apply automatically.
                </li>
              </ol>
            </Card>

            <div className="grid gap-4 sm:grid-cols-2">
              {LINKS.map((l) => (
                <Link
                  key={l.to}
                  to={l.to}
                  className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-brand-400 hover:shadow"
                >
                  <h3 className="font-semibold text-slate-900">{l.title}</h3>
                  <p className="mt-1 text-sm text-slate-500">{l.hint}</p>
                </Link>
              ))}
            </div>

            <Card title="Account status">
              <div className="flex flex-wrap items-center gap-3 text-sm">
                <Badge tone={stats.linkedStudents === stats.students ? "green" : "amber"}>
                  {stats.linkedStudents}/{stats.students} students signed up
                </Badge>
                <Badge tone={stats.linkedTeachers === stats.teachers ? "green" : "amber"}>
                  {stats.linkedTeachers}/{stats.teachers} teachers signed up
                </Badge>
              </div>
              <p className="mt-3 text-sm text-slate-500">
                A record shows as <span className="font-medium text-slate-700">Pending</span> until that
                person creates a login with the exact email you entered. Adding them here again links the
                two immediately.
              </p>
            </Card>
          </>
        )}
      </div>
    </AdminShell>
  );
}

function Stat({ label, value, sub }: { label: string; value: number; sub?: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <p className="tabular text-3xl font-bold text-slate-900">{value}</p>
      <p className="text-sm font-medium text-slate-600">{label}</p>
      {sub && <p className="mt-1 text-xs text-slate-400">{sub}</p>}
    </div>
  );
}