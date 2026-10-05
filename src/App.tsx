import type { ReactNode } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AuthProvider, useAuth } from "@/context/AuthContext";
import ProtectedRoute from "@/components/ProtectedRoute";
import { Loader } from "@/components/Feedback";
import Login from "@/pages/Login";
import StudentDashboard from "@/pages/student/StudentDashboard";
import ScanPage from "@/pages/student/ScanPage";
import HistoryPage from "@/pages/student/HistoryPage";
import TeacherDashboard from "@/pages/teacher/TeacherDashboard";
import SessionPage from "@/pages/teacher/SessionPage";
import RecordsPage from "@/pages/teacher/RecordsPage";
import AdminOverview from "@/pages/admin/AdminOverview";
import TeachersPage from "@/pages/admin/TeachersPage";
import StudentsPage from "@/pages/admin/StudentsPage";
import SubjectsPage from "@/pages/admin/SubjectsPage";
import UsersPage from "@/pages/admin/UsersPage";

/** Sends each role to its own home page (PRD §7.1 role-based access). */
function RoleHome() {
  const { session, profile, loading } = useAuth();
  if (loading) return <Loader label="Loading SmartAttend…" />;
  if (!session) return <Navigate to="/login" replace />;
  const home =
    profile?.role === "admin" ? "/admin" : profile?.role === "teacher" ? "/teacher" : "/student";
  return <Navigate to={home} replace />;
}

/** Admin routes share one guard. */
const withAdmin = (page: ReactNode) => (
  <ProtectedRoute roles={["admin"]}>{page}</ProtectedRoute>
);

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/" element={<RoleHome />} />
          <Route path="/login" element={<Login />} />

          <Route
            path="/student"
            element={
              <ProtectedRoute roles={["student"]}>
                <StudentDashboard />
              </ProtectedRoute>
            }
          />
          <Route
            path="/student/scan"
            element={
              <ProtectedRoute roles={["student"]}>
                <ScanPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/student/scan/:token"
            element={
              <ProtectedRoute roles={["student"]}>
                <ScanPage />
              </ProtectedRoute>
            }
          />
          {/* Alias: short /scan/:token links from previously generated QR codes */}
          <Route
            path="/scan/:token"
            element={
              <ProtectedRoute roles={["student"]}>
                <ScanPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/student/history"
            element={
              <ProtectedRoute roles={["student"]}>
                <HistoryPage />
              </ProtectedRoute>
            }
          />

          <Route
            path="/teacher"
            element={
              <ProtectedRoute roles={["teacher", "admin"]}>
                <TeacherDashboard />
              </ProtectedRoute>
            }
          />
          <Route
            path="/teacher/session/:sessionId"
            element={
              <ProtectedRoute roles={["teacher", "admin"]}>
                <SessionPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/teacher/records"
            element={
              <ProtectedRoute roles={["teacher", "admin"]}>
                <RecordsPage />
              </ProtectedRoute>
            }
          />

          <Route path="/admin" element={withAdmin(<AdminOverview />)} />
          <Route path="/admin/teachers" element={withAdmin(<TeachersPage />)} />
          <Route path="/admin/students" element={withAdmin(<StudentsPage />)} />
          <Route path="/admin/subjects" element={withAdmin(<SubjectsPage />)} />
          <Route path="/admin/users" element={withAdmin(<UsersPage />)} />

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
