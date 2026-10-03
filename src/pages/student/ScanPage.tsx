import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import Layout from "@/components/Layout";
import QrScanner from "@/components/QrScanner";
import { Card } from "@/components/Feedback";
import { AppError, markAttendance } from "@/lib/api";
import { parseQrPayload } from "@/lib/qr";
import type { MarkAttendanceResult } from "@/lib/types";

type Phase = "scanning" | "submitting" | "done";

export default function ScanPage() {
  const { token: tokenFromUrl } = useParams();
  const navigate = useNavigate();

  const [manualToken, setManualToken] = useState("");
  const [phase, setPhase] = useState<Phase>("scanning");
  const [result, setResult] = useState<MarkAttendanceResult | null>(null);

  // Guards against a camera firing the success callback many times per second.
  const lockedRef = useRef(false);

  const submit = useCallback(async (token: string) => {
    if (lockedRef.current) return;
    lockedRef.current = true;
    setPhase("submitting");

    try {
      const res = await markAttendance(token);
      setResult(res);
    } catch (e) {
      const code = e instanceof AppError ? e.code : "error";
      setResult({
        ok: false,
        code: "invalid_qr",
        message: e instanceof Error ? e.message : "Could not mark attendance.",
      });
      void code;
    } finally {
      setPhase("done");
    }
  }, []);

  // Deep link: /student/scan/:token (used by the QR payload and manual testing)
  useEffect(() => {
    const token = parseQrPayload(tokenFromUrl ?? "");
    if (token) void submit(token);
  }, [tokenFromUrl, submit]);

  function handleDecoded(text: string) {
    const token = parseQrPayload(text);
    if (!token) {
      setResult({
        ok: false,
        code: "invalid_qr",
        message: "That QR code is not a SmartAttend code.",
      });
      return;
    }
    navigate(`/student/scan/${token}`, { replace: true });
  }

  function scanAgain() {
    lockedRef.current = false;
    setResult(null);
    setPhase("scanning");
    navigate("/student/scan", { replace: true });
  }

  return (
    <Layout
      title="Student"
      subtitle="Scan the QR code displayed by your teacher"
      nav={[
        { to: "/student", label: "Dashboard" },
        { to: "/student/scan", label: "Scan QR" },
        { to: "/student/history", label: "History" },
      ]}
    >
      <div className="mx-auto max-w-md space-y-5">
        {phase === "done" && result ? (
          <Card>
            <div className="text-center">
              <div
                className={`mx-auto grid h-14 w-14 place-items-center rounded-full text-2xl ${
                  result.ok ? "bg-emerald-100 text-emerald-600" : "bg-rose-100 text-rose-600"
                }`}
              >
                {result.ok ? "✓" : "✕"}
              </div>

              <h1 className="mt-4 text-lg font-bold text-slate-900">
                {result.ok ? "Attendance Marked" : "Could Not Mark Attendance"}
              </h1>
              <p className="mt-1 text-sm text-slate-600">{result.message}</p>
              {result.ok && result.subject && (
                <p className="mt-1 text-sm text-slate-500">{result.subject}</p>
              )}

              <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-center">
                <button
                  onClick={scanAgain}
                  className="rounded-xl bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-brand-700"
                >
                  Scan another code
                </button>
                <Link
                  to="/student"
                  className="rounded-xl border border-slate-300 px-5 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Back to dashboard
                </Link>
              </div>
            </div>
          </Card>
        ) : (
          <>
            <Card>
              {phase === "submitting" ? (
                <p className="py-10 text-center text-sm text-slate-500">Verifying your QR code…</p>
              ) : (
                <QrScanner onScan={handleDecoded} />
              )}
            </Card>

            <Card title="Camera not working?">
              <p className="mb-3 text-sm text-slate-500">
                Type the code shown under the QR on the projector instead.
              </p>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  const token = parseQrPayload(manualToken);
                  if (token) navigate(`/student/scan/${token}`, { replace: true });
                }}
                className="flex gap-2"
              >
                <input
                  value={manualToken}
                  onChange={(e) => setManualToken(e.target.value)}
                  placeholder="X7K92AB83"
                  className="w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm tracking-widest uppercase outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
                />
                <button
                  type="submit"
                  className="rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-800"
                >
                  Submit
                </button>
              </form>
            </Card>
          </>
        )}
      </div>
    </Layout>
  );
}
