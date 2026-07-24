import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { AppShell } from "@/components/app-shell";
import { isAuthenticated, getCurrentUser } from "@/lib/auth";

export const Route = createFileRoute("/app")({
  beforeLoad: () => {
    if (typeof window === "undefined") return;
    if (!isAuthenticated()) {
      throw redirect({ to: "/login" });
    }
    const user = getCurrentUser();
    if (user?.must_change_password) {
      throw redirect({ to: "/change-password" });
    }
  },
  component: () => (
    <AppShell>
      <Outlet />
    </AppShell>
  ),
});
