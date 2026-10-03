import { APP_URL } from "./supabase";

/** What gets encoded into the QR image shown on the projector. */
export function buildQrPayload(token: string): string {
  return `${APP_URL}/student/scan/${token}`;
}

/**
 * Accepts either a full SmartAttend URL (normal case) or a bare token
 * (someone re-types the code, or an older QR).
 */
export function parseQrPayload(text: string): string | null {
  const raw = text.trim();
  if (!raw) return null;

  try {
    const url = new URL(raw);
    const fromPath = url.pathname.match(/\/scan\/([A-Za-z0-9]+)\/?$/);
    if (fromPath) return fromPath[1].toUpperCase();
    const fromQuery = url.searchParams.get("token");
    if (fromQuery) return fromQuery.toUpperCase();
  } catch {
    /* not a URL — fall through */
  }

  if (/^[A-Za-z0-9]{6,32}$/.test(raw)) return raw.toUpperCase();
  return null;
}
