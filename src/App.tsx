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

/** Sends each role to its own home page (PRD §7.1 role-based access). */
function RoleHome() {
  const { session, profile, loading } = useAuth();
  if (loading) return <Loader label="Loading SmartAttend…" />;
  if (!session) return <Navigate to="/login" replace />;
  return <Navigate to={profile?.role === "teacher" || profile?.role === "admin" ? "/teacher" : "/student"} replace />;
}

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

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
