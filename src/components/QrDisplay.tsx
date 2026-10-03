import { useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import { formatCountdown, formatTime, secondsLeft } from "@/lib/format";
import { buildQrPayload } from "@/lib/qr";

export default function QrDisplay({
  token,
  expiresAt,
  size = 280,
}: {
  token: string;
  expiresAt: string;
  size?: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [now, setNow] = useState(Date.now());
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    QRCode.toCanvas(canvas, buildQrPayload(token), {
      width: size,
      margin: 2,
      errorCorrectionLevel: "M",
      color: { dark: "#0f172a", light: "#ffffff" },
    }).catch(() => setFailed(true));
  }, [token, size]);

  const left = secondsLeft(expiresAt, now);
  const expired = left <= 0;
  const pct = Math.min(100, (left / 120) * 100);

  return (
    <div className="flex flex-col items-center gap-4">
      <div className="relative rounded-2xl bg-white p-4 shadow-inner ring-1 ring-slate-200">
        <canvas ref={canvasRef} width={size} height={size} className="h-auto w-full rounded-lg" />
        {expired && (
          <div className="absolute inset-0 grid place-items-center rounded-2xl bg-white/85 backdrop-blur-sm">
            <div className="text-center">
              <p className="text-lg font-bold text-rose-600">QR Expired</p>
              <p className="text-xs text-slate-500">Start a new session</p>
            </div>
          </div>
        )}
      </div>

      {failed && <p className="text-sm text-rose-600">Could not render the QR code.</p>}

      <div className="w-full max-w-[280px]">
        <div className="mb-1.5 flex items-center justify-between text-sm">
          <span className="text-slate-500">Expires at</span>
          <span className="tabular font-semibold text-slate-800">{formatTime(expiresAt)}</span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-slate-200">
          <div
            className={`h-full rounded-full transition-all duration-300 ${
              left <= 20 ? "bg-rose-500" : "bg-emerald-500"
            }`}
            style={{ width: `${pct}%` }}
          />
        </div>
        <p className="tabular mt-2 text-center text-sm font-medium text-slate-600">
          {expired ? "Expired" : `${formatCountdown(left)} remaining`}
        </p>
      </div>

      <p className="text-xs tracking-[0.3em] text-slate-400">{token}</p>
    </div>
  );
}
