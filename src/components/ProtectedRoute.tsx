import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { Loader } from "./Feedback";
import { useAuth } from "@/context/AuthContext";
import type { Role } from "@/lib/types";

/** Gate for signed-in areas; `roles` restricts a route to specific roles (PRD §7.1). */
export default function ProtectedRoute({ roles, children }: { roles?: Role[]; children: ReactNode }) {
  const { session, profile, loading } = useAuth();
  const location = useLocation();

  if (loading) return <Loader label="Checking your session…" />;

  if (!session) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  // profile may briefly be null right after signup; the fallback role keeps the
  // app usable, and RLS still protects the data.
  const role = profile?.role ?? "student";
  if (roles && !roles.includes(role)) {
    return <Navigate to={role === "teacher" ? "/teacher" : "/student"} replace />;
  }

  return <>{children}</>;
}
