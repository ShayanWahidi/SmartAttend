import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const isSupabaseConfigured = Boolean(
  url && anonKey && !url.includes("YOUR-PROJECT-REF") && !anonKey.includes("your-anon"),
);

if (!isSupabaseConfigured) {
  console.error(
    "SmartAttend: Supabase env vars are missing. Copy .env.example to .env and fill in VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.",
  );
}

export const supabase = createClient(
  url ?? "http://localhost",
  anonKey ?? "public-anon-key",
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  },
);

/** Base URL used to build the URL encoded inside the QR image. */
export const APP_URL = (import.meta.env.VITE_APP_URL || window.location.origin).replace(/\/$/, "");
