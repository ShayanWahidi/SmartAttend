import { useCallback, useEffect, useState } from "react";
import AdminShell from "./AdminShell";
import { Card, EmptyState, ErrorBanner, Loader } from "@/components/Feedback";
import { Badge, Button, Field, inputClass, Modal, Notice } from "@/components/ui";
import { createTeacher, deleteTeacher, fetchAllSubjects, fetchAllTeachers, syncUser, updateTeacher } from "@/lib/api";
import type { Subject, Teacher } from "@/lib/types";

export default function TeachersPage() {
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [confirm, setConfirm] = useState<Teacher | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [t, s] = await Promise.all([fetchAllTeachers(), fetchAllSubjects()]);
      setTeachers(t);
      setSubjects(s);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load teachers.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  function reset() {
    setName("");
    setEmail("");
    setEditingId(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setFlash(null);

    if (!name.trim() || !email.trim()) {
      setError("Name and email are both required.");
      return;
    }
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())) {
      setError("Enter a valid email address.");
      return;
    }

    setSaving(true);
    try {
      if (editingId) {
        await updateTeacher(editingId, { name: name.trim(), email: email.trim().toLowerCase() });
        const linked = await syncUser(email, "teacher", name);
        setFlash(
          linked
            ? "Teacher updated and the existing login was re-linked."
            : "Teacher updated. They will be linked automatically when they sign up with this email.",
        );
      } else {
        await createTeacher(name, email);
        const linked = await syncUser(email, "teacher", name);
        setFlash(
          linked
            ? `Teacher added and linked to the existing login for ${email}.`
            : `Teacher added. ${email} gets teacher access as soon as they sign up with that email.`,
        );
      }
      reset();
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save the teacher.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!confirm) return;
    setDeleting(true);
    setError(null);
    try {
      await deleteTeacher(confirm.id);
      setFlash(`Removed ${confirm.name}. Their subjects are now unassigned.`);
      setConfirm(null);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not remove the teacher.");
    } finally {
      setDeleting(false);
    }
  }

  function startEdit(t: Teacher) {
    setEditingId(t.id);
    setName(t.name);
    setEmail(t.email);
    setFlash(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  return (
    <AdminShell subtitle="Faculty records. The email decides their role when they sign up.">
      <div className="space-y-6">
        <Card title={editingId ? "Edit teacher" : "Add teacher"}>
          <form onSubmit={handleSubmit} className="grid gap-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
            <Field label="Full name">
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                className={inputClass}
                placeholder="Dr. Anita Sharma"
              />
            </Field>
            <Field label="College email" hint="Must match the email they log in with.">
              <input
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className={inputClass}
                placeholder="anita.sharma@college.edu"
                type="email"
              />
            </Field>
            <div className="flex gap-2">
              <Button type="submit" disabled={saving}>
                {saving ? "Saving…" : editingId ? "Save changes" : "Add teacher"}
              </Button>
              {editingId && (
                <Button variant="ghost" onClick={reset}>
                  Cancel
                </Button>
              )}
            </div>
          </form>
        </Card>

        {error && <ErrorBanner message={error} />}
        {flash && <Notice tone="success">{flash}</Notice>}

        <Card title={`Teachers (${teachers.length})`}>
          {loading ? (
            <Loader />
          ) : teachers.length === 0 ? (
            <EmptyState title="No teachers yet" hint="Add your first faculty member above." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                    <th className="pb-2 pr-3 font-medium">Name</th>
                    <th className="pb-2 pr-3 font-medium">Email</th>
                    <th className="pb-2 pr-3 font-medium">Subjects</th>
                    <th className="pb-2 pr-3 font-medium">Login</th>
                    <th className="pb-2 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {teachers.map((t) => {
                    const count = subjects.filter((s) => s.teacher_id === t.id).length;
                    return (
                      <tr key={t.id}>
                        <td className="py-3 pr-3 font-medium text-slate-800">{t.name}</td>
                        <td className="py-3 pr-3 text-slate-600">{t.email}</td>
                        <td className="py-3 pr-3 text-slate-600">{count}</td>
                        <td className="py-3 pr-3">
                          <Badge tone={t.auth_id ? "green" : "amber"}>
                            {t.auth_id ? "Linked" : "Pending"}
                          </Badge>
                        </td>
                        <td className="py-3">
                          <div className="flex gap-2">
                            <Button variant="ghost" onClick={() => startEdit(t)}>
                              Edit
                            </Button>
                            <Button variant="danger" onClick={() => setConfirm(t)}>
                              Delete
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <Modal
          open={confirm !== null}
          title="Remove teacher?"
          confirmLabel="Remove teacher"
          busy={deleting}
          onCancel={() => setConfirm(null)}
          onConfirm={handleDelete}
          body={
            <>
              <p>
                <span className="font-medium text-slate-800">{confirm?.name}</span> will no longer be able to
                start attendance sessions.
              </p>
              {confirm &&
                (subjects.filter((s) => s.teacher_id === confirm.id).length > 0 ? (
                  <p className="mt-2 text-amber-700">
                    Their subjects will become unassigned. Reassign them on the Subjects tab.
                  </p>
                ) : (
                  <p className="mt-2">This teacher has no subjects.</p>
                ))}
            </>
          }
        />
      </div>
    </AdminShell>
  );
}