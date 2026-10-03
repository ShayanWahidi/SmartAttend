import { useEffect, useRef, useState } from "react";
import type { Html5Qrcode } from "html5-qrcode";

interface Props {
  onScan: (token: string) => void;
  disabled?: boolean;
}

const REGION_ID = "smartattend-qr-reader";

export default function QrScanner({ onScan, disabled }: Props) {
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const firedRef = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(true);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const { Html5Qrcode: Scanner } = await import("html5-qrcode");
        if (cancelled) return;

        const scanner = new Scanner(REGION_ID, { verbose: false });
        scannerRef.current = scanner;

        await scanner.start(
          { facingMode: "environment" },
          { fps: 10, qrbox: { width: 240, height: 240 }, aspectRatio: 1 },
          (decodedText) => {
            if (firedRef.current) return;
            firedRef.current = true;
            onScan(decodedText);
          },
          () => {
            /* a frame without a QR code — ignore */
          },
        );

        if (cancelled) {
          await scanner.stop();
          scanner.clear();
          return;
        }
        setStarting(false);
      } catch (e) {
        if (cancelled) return;
        setStarting(false);
        const message =
          (e as { name?: string })?.name === "NotAllowedError"
            ? "Camera permission was denied. Allow camera access in your browser and reload."
            : "Could not start the camera. Make sure no other app is using it, then reload.";
        setError(message);
      }
    })();

    return () => {
      cancelled = true;
      const scanner = scannerRef.current;
      scannerRef.current = null;
      if (scanner) {
        scanner
          .stop()
          .then(() => scanner.clear())
          .catch(() => undefined);
      }
    };
  }, [onScan]);

  return (
    <div className="space-y-3">
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-slate-900">
        <div id={REGION_ID} className="w-full [&_video]:w-full [&_video]:rounded-2xl" />
      </div>

      {starting && <p className="text-center text-sm text-slate-500">Starting camera…</p>}
      {error && (
        <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          {error}
        </p>
      )}
      {disabled && (
        <p className="text-center text-sm text-slate-500">Camera stopped — scan again to restart.</p>
      )}

      <p className="text-center text-xs text-slate-500">
        Point the camera at the QR code on the projector screen.
      </p>
    </div>
  );
}
