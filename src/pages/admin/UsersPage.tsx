import { useCallback, useEffect, useState } from "react";
import AdminShell from "./AdminShell";
import { Card, EmptyState, ErrorBanner, Loader } from "@/components/Feedback";
import { Badge, Button, Notice } from "@/components/ui";
import { fetchAllProfiles, fetchAllStudents, fetchAllTeachers, updateProfileRole } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import type { Profile, Role } from "@/lib/types";

export default function UsersPage() {
  const { profile } = useAuth();
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [linkage, setLinkage] = useState<Map<string, string>>(() => new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [p, teachers, students] = await Promise.all([
        fetchAllProfiles(),
        fetchAllTeachers(),
        fetchAllStudents(),
      ]);
      setProfiles(p);

      // Roll number / teacher name per auth user, resolved from the linked records.
      const map = new Map<string, string>();
      students.forEach((s) => s.auth_id && map.set(s.auth_id, `Roll No. ${s.roll_no}`));
      teachers.forEach((t) => t.auth_id && map.set(t.auth_id, "Faculty"));
      setLinkage(map);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load accounts.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleRoleChange(p: Profile, role: Role) {
    setSavingId(p.id);
    setError(null);
    setFlash(null);
    try {
      await updateProfileRole(p.id, role);
      setFlash(`${p.full_name} is now an ${role}.`);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not change the role.");
    } finally {
      setSavingId(null);
    }
  }

  return (
    <AdminShell subtitle="Accounts that have signed in. Roles here decide what each person can do.">
      <div className="space-y-6">
        {error && <ErrorBanner message={error} />}
        {flash && <Notice tone="success">{flash}</Notice>}

        <Card title={`Accounts (${profiles.length})`}>
          {loading ? (
            <Loader />
          ) : profiles.length === 0 ? (
            <EmptyState
              title="No accounts yet"
              hint="People appear here after they sign up on the login page with an email you registered."
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                    <th className="pb-2 pr-3 font-medium">Name</th>
                    <th className="pb-2 pr-3 font-medium">Record</th>
                    <th className="pb-2 pr-3 font-medium">Role</th>
                    <th className="pb-2 font-medium">Change role</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {profiles.map((p) => (
                    <tr key={p.id}>
                      <td className="py-3 pr-3">
                        <p className="font-medium text-slate-800">{p.full_name}</p>
                        <p className="font-mono text-xs text-slate-400">{p.id.slice(0, 8)}</p>
                      </td>
                      <td className="py-3 pr-3 text-slate-600">{linkage.get(p.id) ?? "—"}</td>
                      <td className="py-3 pr-3">
                        <Badge tone={p.role === "admin" ? "amber" : p.role === "teacher" ? "green" : "slate"}>
                          {p.role}
                        </Badge>
                      </td>
                      <td className="py-3">
                        {p.id === profile?.id ? (
                          <span className="text-xs text-slate-400">This is you</span>
                        ) : (
                          <div className="flex flex-wrap gap-2">
                            {(["student", "teacher", "admin"] as Role[]).map((r) => (
                              <Button
                                key={r}
                                variant={p.role === r ? "primary" : "ghost"}
                                disabled={savingId === p.id || p.role === r}
                                onClick={() => handleRoleChange(p, r)}
                              >
                                {r}
                              </Button>
                            ))}
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <Card title="How roles work">
          <ul className="space-y-2 text-sm text-slate-600">
            <li>
              <span className="font-medium text-slate-800">student</span> — dashboard, QR scanning, own
              records. Assigned automatically when their email is in the students table.
            </li>
            <li>
              <span className="font-medium text-slate-800">teacher</span> — subjects, live attendance, CSV
              export. Assigned automatically when their email is in the teachers table.
            </li>
            <li>
              <span className="font-medium text-slate-800">admin</span> — this console. Never granted
              automatically; promote people here.
            </li>
          </ul>
          <p className="mt-3 text-sm text-amber-700">
            Granting the teacher role here only changes portal access. To let someone take attendance, add
            them on the Teachers tab and assign them a subject — the database checks both.
          </p>
        </Card>
      </div>
    </AdminShell>
  );
}