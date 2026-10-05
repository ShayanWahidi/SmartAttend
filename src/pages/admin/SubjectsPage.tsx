import { useCallback, useEffect, useMemo, useState } from "react";
import AdminShell from "./AdminShell";
import { Card, EmptyState, ErrorBanner, Loader } from "@/components/Feedback";
import { Badge, Button, Field, inputClass, Modal, Notice } from "@/components/ui";
import {
  createSubject,
  deleteSubject,
  enrollStudents,
  fetchAllStudents,
  fetchAllSubjects,
  fetchAllTeachers,
  fetchEnrollments,
  unenrollStudent,
  updateSubject,
} from "@/lib/api";
import type { Student, Subject, Teacher } from "@/lib/types";

export default function SubjectsPage() {
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [teacherId, setTeacherId] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [openId, setOpenId] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<Subject | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [s, t] = await Promise.all([fetchAllSubjects(), fetchAllTeachers()]);
      setSubjects(s);
      setTeachers(t);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load subjects.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const teacherName = useMemo(
    () => (id: string | null) => teachers.find((t) => t.id === id)?.name ?? null,
    [teachers],
  );

  function reset() {
    setName("");
    setCode("");
    setTeacherId("");
    setEditingId(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setFlash(null);

    if (!name.trim()) {
      setError("Subject name is required.");
      return;
    }

    setSaving(true);
    try {
      if (editingId) {
        await updateSubject(editingId, {
          name: name.trim(),
          code: code.trim() ? code.trim().toUpperCase() : null,
          teacher_id: teacherId || null,
        });
        setFlash("Subject updated.");
      } else {
        await createSubject(name, code, teacherId || null);
        setFlash(
          teacherId
            ? `Subject created. The teacher can start attendance for it now.`
            : "Subject created. Assign a teacher so they can take attendance.",
        );
      }
      reset();
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save the subject.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!confirm) return;
    setDeleting(true);
    setError(null);
    try {
      await deleteSubject(confirm.id);
      setFlash(`Deleted ${confirm.code ?? confirm.name}, along with its sessions and attendance records.`);
      setConfirm(null);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not delete the subject.");
    } finally {
      setDeleting(false);
    }
  }

  function startEdit(s: Subject) {
    setEditingId(s.id);
    setName(s.name);
    setCode(s.code ?? "");
    setTeacherId(s.teacher_id ?? "");
    setFlash(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  return (
    <AdminShell subtitle="Create subjects, assign the teacher, and build each class list.">
      <div className="space-y-6">
        <Card title={editingId ? "Edit subject" : "Create subject"}>
          <form onSubmit={handleSubmit} className="grid gap-4 sm:grid-cols-[1fr_0.6fr_1fr_auto] sm:items-end">
            <Field label="Subject name">
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                className={inputClass}
                placeholder="Data Structures & Algorithms"
              />
            </Field>
            <Field label="Code" hint="Optional, shown on the dashboard.">
              <input
                value={code}
                onChange={(e) => setCode(e.target.value)}
                className={inputClass}
                placeholder="CS301"
              />
            </Field>
            <Field label="Teacher">
              <select
                value={teacherId}
                onChange={(e) => setTeacherId(e.target.value)}
                className={inputClass}
              >
                <option value="">Unassigned</option>
                {teachers.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </Field>
            <div className="flex gap-2">
              <Button type="submit" disabled={saving}>
                {saving ? "Saving…" : editingId ? "Save changes" : "Create subject"}
              </Button>
              {editingId && (
                <Button variant="ghost" onClick={reset}>
                  Cancel
                </Button>
              )}
            </div>
          </form>
          {teachers.length === 0 && (
            <p className="mt-3 text-sm text-amber-700">
              No teachers yet — add one on the Teachers tab first.
            </p>
          )}
        </Card>

        {error && <ErrorBanner message={error} />}
        {flash && <Notice tone="success">{flash}</Notice>}

        <Card title={`Subjects (${subjects.length})`}>
          {loading ? (
            <Loader />
          ) : subjects.length === 0 ? (
            <EmptyState title="No subjects yet" hint="Create one above to get started." />
          ) : (
            <ul className="space-y-3">
              {subjects.map((s) => {
                const assigned = teacherName(s.teacher_id);
                const expanded = openId === s.id;
                return (
                  <li key={s.id} className="rounded-xl border border-slate-200">
                    <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                      <div>
                        <p className="font-semibold text-slate-900">
                          {s.code && <span className="mr-2 text-slate-500">{s.code}</span>}
                          {s.name}
                        </p>
                        <p className="mt-0.5 text-sm text-slate-500">
                          {assigned ? `Taught by ${assigned}` : "No teacher assigned"}
                        </p>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        {!assigned && <Badge tone="amber">Needs teacher</Badge>}
                        <Button variant="ghost" onClick={() => startEdit(s)}>
                          Edit
                        </Button>
                        <Button
                          variant="primary"
                          onClick={() => setOpenId(expanded ? null : s.id)}
                        >
                          {expanded ? "Hide class list" : "Class list"}
                        </Button>
                        <Button variant="danger" onClick={() => setConfirm(s)}>
                          Delete
                        </Button>
                      </div>
                    </div>

                    {expanded && (
                      <div className="border-t border-slate-100 px-4 py-4">
                        <RosterEditor subject={s} onChanged={load} />
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        <Modal
          open={confirm !== null}
          title="Delete subject?"
          confirmLabel="Delete subject"
          busy={deleting}
          onCancel={() => setConfirm(null)}
          onConfirm={handleDelete}
          body={
            <p>
              <span className="font-medium text-slate-800">
                {confirm?.code ? `${confirm.code} — ` : ""}
                {confirm?.name}
              </span>{" "}
              and every attendance session and record under it will be permanently deleted. This cannot be
              undone.
            </p>
          }
        />
      </div>
    </AdminShell>
  );
}

/** Add/remove students in one subject's class list. */
function RosterEditor({ subject, onChanged }: { subject: Subject; onChanged: () => Promise<void> }) {
  const [students, setStudents] = useState<Student[]>([]);
  const [enrolledIds, setEnrolledIds] = useState<string[]>([]);
  const [selected, setSelected] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [all, ids] = await Promise.all([fetchAllStudents(), fetchEnrollments(subject.id)]);
      setStudents(all);
      setEnrolledIds(ids);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load the class list.");
    } finally {
      setLoading(false);
    }
  }, [subject.id]);

  useEffect(() => {
    void load();
  }, [load]);

  const enrolled = students.filter((s) => enrolledIds.includes(s.id));
  const available = students.filter((s) => !enrolledIds.includes(s.id));

  async function handleAdd() {
    if (!selected) return;
    setBusy(true);
    setError(null);
    try {
      await enrollStudents(subject.id, [selected]);
      setSelected("");
      await load();
      await onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not add the student.");
    } finally {
      setBusy(false);
    }
  }

  async function handleRemove(studentId: string) {
    setBusy(true);
    setError(null);
    try {
      await unenrollStudent(subject.id, studentId);
      await load();
      await onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not remove the student.");
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <Loader label="Loading class list…" />;

  return (
    <div className="space-y-4">
      {error && <p className="text-sm text-rose-600">{error}</p>}

      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <h4 className="mb-2 text-sm font-semibold text-slate-700">
            In this class ({enrolled.length})
          </h4>
          {enrolled.length === 0 ? (
            <p className="rounded-xl border border-dashed border-slate-300 px-4 py-6 text-center text-sm text-slate-500">
              No students yet. Attendance cannot be taken until the class list has students.
            </p>
          ) : (
            <ul className="max-h-72 divide-y divide-slate-100 overflow-y-auto rounded-xl border border-slate-200">
              {enrolled.map((s) => (
                <li key={s.id} className="flex items-center justify-between gap-2 px-3 py-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-slate-800">{s.name}</p>
                    <p className="truncate font-mono text-xs text-slate-500">{s.roll_no}</p>
                  </div>
                  <Button variant="ghost" onClick={() => handleRemove(s.id)} disabled={busy}>
                    Remove
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div>
          <h4 className="mb-2 text-sm font-semibold text-slate-700">
            Available ({available.length})
          </h4>
          {available.length === 0 ? (
            <p className="rounded-xl border border-dashed border-slate-300 px-4 py-6 text-center text-sm text-slate-500">
              Every student is already in this class.
            </p>
          ) : (
            <div className="flex gap-2">
              <select
                value={selected}
                onChange={(e) => setSelected(e.target.value)}
                className={inputClass}
              >
                <option value="">Select a student…</option>
                {available.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.roll_no} — {s.name}
                  </option>
                ))}
              </select>
              <Button onClick={handleAdd} disabled={!selected || busy}>
                Add
              </Button>
            </div>
          )}
          {available.length > 0 && students.length === 0 && (
            <p className="mt-2 text-xs text-slate-500">Add students on the Students tab first.</p>
          )}
        </div>
      </div>
    </div>
  );
}