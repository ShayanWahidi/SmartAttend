import type { ReactNode } from "react";
import Layout from "@/components/Layout";

const NAV = [
  { to: "/admin", label: "Overview" },
  { to: "/admin/teachers", label: "Teachers" },
  { to: "/admin/students", label: "Students" },
  { to: "/admin/subjects", label: "Subjects" },
  { to: "/admin/users", label: "Users" },
];

export default function AdminShell({
  subtitle,
  children,
}: {
  subtitle: string;
  children: ReactNode;
}) {
  return (
    <Layout title="Admin Console" subtitle={subtitle} nav={NAV}>
      {children}
    </Layout>
  );
}