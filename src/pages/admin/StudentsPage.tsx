import { useCallback, useEffect, useMemo, useState } from "react";
import AdminShell from "./AdminShell";
import { Card, EmptyState, ErrorBanner, Loader } from "@/components/Feedback";
import { Badge, Button, Field, inputClass, Modal, Notice } from "@/components/ui";
import {
  countStudentAttendance,
  createStudent,
  deleteStudent,
  fetchAllStudents,
  syncUser,
  updateStudent,
} from "@/lib/api";
import type { Student } from "@/lib/types";

export default function StudentsPage() {
  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  const [name, setName] = useState("");
  const [rollNo, setRollNo] = useState("");
  const [email, setEmail] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [confirm, setConfirm] = useState<Student | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      setStudents(await fetchAllStudents());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load students.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return students;
    return students.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        s.roll_no.toLowerCase().includes(q) ||
        s.email.toLowerCase().includes(q),
    );
  }, [students, query]);

  function reset() {
    setName("");
    setRollNo("");
    setEmail("");
    setEditingId(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setFlash(null);

    if (!name.trim() || !rollNo.trim() || !email.trim()) {
      setError("Name, roll number and email are all required.");
      return;
    }
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())) {
      setError("Enter a valid email address.");
      return;
    }

    setSaving(true);
    try {
      if (editingId) {
        await updateStudent(editingId, {
          name: name.trim(),
          roll_no: rollNo.trim(),
          email: email.trim().toLowerCase(),
        });
        const linked = await syncUser(email, "student", name);
        setFlash(linked ? "Student updated and login re-linked." : "Student updated.");
      } else {
        await createStudent(name, rollNo, email);
        const linked = await syncUser(email, "student", name);
        setFlash(
          linked
            ? `Student added and linked to the existing login for ${email}.`
            : `Student added. ${email} gets student access as soon as they sign up with that email.`,
        );
      }
      reset();
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save the student.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!confirm) return;
    setDeleting(true);
    setError(null);
    try {
      // attendance rows cascade-delete with the student, so refuse to lose data
      const records = await countStudentAttendance(confirm.id);
      if (records > 0) {
        setError(
          `${confirm.name} has ${records} attendance record${records === 1 ? "" : "s"}. Those would be deleted too — remove them from the report first if you want to keep them.`,
        );
        setConfirm(null);
        return;
      }
      await deleteStudent(confirm.id);
      setFlash(`Removed ${confirm.name} (${confirm.roll_no}).`);
      setConfirm(null);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not remove the student.");
    } finally {
      setDeleting(false);
    }
  }

  function startEdit(s: Student) {
    setEditingId(s.id);
    setName(s.name);
    setRollNo(s.roll_no);
    setEmail(s.email);
    setFlash(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  return (
    <AdminShell subtitle="Student records. Roll number and email are both unique.">
      <div className="space-y-6">
        <Card title={editingId ? "Edit student" : "Add student"}>
          <form
            onSubmit={handleSubmit}
            className="grid gap-4 sm:grid-cols-2 lg:grid-cols-[1fr_0.7fr_1fr_auto] lg:items-end"
          >
            <Field label="Full name">
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                className={inputClass}
                placeholder="Aarav Mehta"
              />
            </Field>
            <Field label="Roll number">
              <input
                value={rollNo}
                onChange={(e) => setRollNo(e.target.value)}
                className={inputClass}
                placeholder="CS21B001"
              />
            </Field>
            <Field label="College email" hint="Must match the email they log in with.">
              <input
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className={inputClass}
                placeholder="aarav.mehta@college.edu"
                type="email"
              />
            </Field>
            <div className="flex gap-2">
              <Button type="submit" disabled={saving}>
                {saving ? "Saving…" : editingId ? "Save changes" : "Add student"}
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

        <Card
          title={`Students (${filtered.length}${query ? ` of ${students.length}` : ""})`}
          action={
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search name, roll no, email"
              className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-xs sm:w-64"
            />
          }
        >
          {loading ? (
            <Loader />
          ) : students.length === 0 ? (
            <EmptyState title="No students yet" hint="Add your first student above." />
          ) : filtered.length === 0 ? (
            <EmptyState title="No students match that search" />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                    <th className="pb-2 pr-3 font-medium">Roll No</th>
                    <th className="pb-2 pr-3 font-medium">Name</th>
                    <th className="pb-2 pr-3 font-medium">Email</th>
                    <th className="pb-2 pr-3 font-medium">Login</th>
                    <th className="pb-2 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filtered.map((s) => (
                    <tr key={s.id}>
                      <td className="py-3 pr-3 font-mono text-xs text-slate-600">{s.roll_no}</td>
                      <td className="py-3 pr-3 font-medium text-slate-800">{s.name}</td>
                      <td className="py-3 pr-3 text-slate-600">{s.email}</td>
                      <td className="py-3 pr-3">
                        <Badge tone={s.auth_id ? "green" : "amber"}>{s.auth_id ? "Linked" : "Pending"}</Badge>
                      </td>
                      <td className="py-3">
                        <div className="flex gap-2">
                          <Button variant="ghost" onClick={() => startEdit(s)}>
                            Edit
                          </Button>
                          <Button variant="danger" onClick={() => setConfirm(s)}>
                            Delete
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <Modal
          open={confirm !== null}
          title="Remove student?"
          confirmLabel="Remove student"
          busy={deleting}
          onCancel={() => setConfirm(null)}
          onConfirm={handleDelete}
          body={
            <p>
              <span className="font-medium text-slate-800">{confirm?.name}</span> ({confirm?.roll_no}) will
              lose access to every subject. Students with attendance records cannot be removed.
            </p>
          }
        />
      </div>
    </AdminShell>
  );
}