import { createFileRoute, redirect } from "@tanstack/react-router";

// Attendance & leave now live inside the Staff & HR module.
export const Route = createFileRoute("/_authenticated/staff-attendance")({
  beforeLoad: () => {
    throw redirect({ to: "/staff", search: { tab: "attendance" }, replace: true });
  },
});
